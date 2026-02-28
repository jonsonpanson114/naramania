import { chromium, Frame } from 'playwright';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

// 奈良県 PPI入札情報システム（ppi06.t-elbs.jp）
// 平日8:00〜20:00のみアクセス可能
const PPI_BASE = 'http://www.ppi06.t-elbs.jp/DENCHO';
const PPI_TOP = `${PPI_BASE}/PpiJGyomuStart.do?kinouid=GP5000_Top`;

// 工事カテゴリでスキップする業種
const KOJI_GYOSHU_SKIP = [
    '土木一式', '舗装', '鋼橋', 'PC橋', '造園', '法面処理', '道路等維持修繕',
    'しゅんせつ', 'グラウト', 'さく井', '上下水道設備', '交通安全施設', '土木施設除草業務',
    '通信設備', '橋梁', '橋', '測量',
];

// 検索対象カテゴリ
// maxPages: 入札結果は累積が多いため最新3ページ（75件）のみ取得
// detailBase: 詳細ページURL（案件情報=GP5510_1020, 入札結果=GP5515_1020）
const SEARCH_TARGETS = [
    { gyoshuKbnCd: '00', menuLabel: '案件情報', status: '受付中' as const, type: '建築' as BiddingType, label: '工事/案件情報', skipGyoshu: true, filterYear: '', maxPages: 0, detailBase: 'GP5510_1020' },
    { gyoshuKbnCd: '00', menuLabel: '入札結果', status: '落札' as const, type: '建築' as BiddingType, label: '工事/入札結果', skipGyoshu: true, filterYear: '2025', maxPages: 3, detailBase: 'GP5515_1020' },
    { gyoshuKbnCd: '01', menuLabel: '案件情報', status: '受付中' as const, type: 'コンサル' as BiddingType, label: 'コンサル/案件情報', skipGyoshu: false, filterYear: '', maxPages: 0, detailBase: 'GP5510_1020' },
    { gyoshuKbnCd: '01', menuLabel: '入札結果', status: '落札' as const, type: 'コンサル' as BiddingType, label: 'コンサル/入札結果', skipGyoshu: false, filterYear: '2025', maxPages: 3, detailBase: 'GP5515_1020' },
];

// "R08.02.20 09:00" → "2026-02-20"
function parsePpiDate(text: string): string {
    const m = text.match(/R(\d+)\.(\d+)\.(\d+)/);
    if (m) {
        const year = 2018 + parseInt(m[1]);
        return `${year}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }
    return new Date().toISOString().split('T')[0];
}

interface RawRow {
    gyoshu: string;
    title: string;
    ankenId: string;
    dateText: string;
    bidDateText: string;
}

// 結果テーブル（class="border"）からデータ行を抽出
// GP5510_1015 (案件情報): 12列 → 業種=cells[6], 日付=cells[7], 開札=cells[8], 工事名=cells[9]
// GP5515_1015 (入札結果):  9列 → 業種=cells[5], 日付=cells[6], 工事名=cells[7]
async function extractRows(fra1: Frame): Promise<RawRow[]> {
    return await fra1.evaluate(() => {
        const table = Array.from(document.querySelectorAll('table')).find(t => t.className === 'border');
        if (!table) return [];
        const rows = Array.from(table.querySelectorAll('tr')).slice(2);
        const results: RawRow[] = [];
        for (const row of rows) {
            const cells = Array.from(row.querySelectorAll('th, td'));
            const isKekka = cells.length <= 10; // GP5515_1015 is 9 cols, GP5510_1015 is 12 cols
            if (cells.length < 8) continue;
            const gyoshuIdx = isKekka ? 5 : 6;
            const dateIdx = isKekka ? 6 : 7;
            const bidDateIdx = isKekka ? -1 : 8;
            const titleIdx = isKekka ? 7 : 9;
            const gyoshu = (cells[gyoshuIdx] as HTMLElement).innerText?.trim()?.split('\n')[0] || '';
            const titleEl = cells[titleIdx] as HTMLElement;
            if (!titleEl) continue;
            const title = titleEl.innerText?.trim()?.replace(/\n/g, '') || '';
            if (!title) continue;
            const linkEl = titleEl.querySelector('a');
            const href = linkEl?.getAttribute('href') || '';
            const m = href.match(/'(\w+)'\)/);
            results.push({
                gyoshu,
                title,
                ankenId: m ? m[1] : '',
                dateText: (cells[dateIdx] as HTMLElement).innerText?.trim()?.split('\n')[0] || '',
                bidDateText: bidDateIdx >= 0 ? ((cells[bidDateIdx] as HTMLElement).innerText?.trim()?.split('\n')[0] || '') : '',
            });
        }
        return results;
    });
}

// 総ページ数を取得（25件/ページ）
async function getTotalPages(fra1: Frame): Promise<number> {
    return await fra1.evaluate(() => {
        const m = document.body?.innerText?.match(/(\d+)件が該当/);
        return m ? Math.ceil(parseInt(m[1]) / 25) : 0;
    });
}

// 入札結果詳細ページ（GP5515_1020）から落札業者名を抽出
async function extractContractorFromFrame(fra1: Frame): Promise<string | undefined> {
    try {
        return await fra1.evaluate((): string | undefined => {
            const text = (document.body as HTMLElement)?.innerText || '';

            // テキストから「落札業者名」「落札業者」「落札者」パターンで検索
            const textPatterns = [
                /落札業者名\s+([^\n\r\t]+)/,
                /落札業者\s+([^\n\r\t]+)/,
                /落札者名?\s+([^\n\r\t]+)/,
            ];
            for (const p of textPatterns) {
                const m = text.match(p);
                if (m) {
                    const name = m[1].trim().split(/\s{2,}/)[0].trim();
                    if (name && name.length >= 2 && name.length <= 60) return name;
                }
            }

            // テーブルのth/td構造を確認（隣接セルパターン）
            const cells = Array.from(document.querySelectorAll('th, td'));
            for (let i = 0; i < cells.length - 1; i++) {
                const label = (cells[i] as HTMLElement).innerText?.trim() || '';
                if (/落札(?:業者|者)/.test(label)) {
                    const next = (cells[i + 1] as HTMLElement)?.innerText?.trim();
                    if (next && next.length >= 2 && next.length <= 60) return next;
                }
            }
            return undefined;
        });
    } catch {
        return undefined;
    }
}

export class NaraPrefScraper implements Scraper {
    municipality: '奈良県' = '奈良県';

    async scrape(): Promise<BiddingItem[]> {
        const browser = await chromium.launch({ headless: true });
        const allItems: BiddingItem[] = [];

        try {
            const page = await browser.newPage();

            for (const { gyoshuKbnCd, menuLabel, status, type, label, skipGyoshu, filterYear, maxPages, detailBase } of SEARCH_TARGETS) {
                console.log(`[奈良県] ${label} 取得中...`);
                try {
                    // 毎回トップページから開始（セッションはCookieで維持）
                    await page.goto(PPI_TOP, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await page.waitForTimeout(5000);

                    // メニューフレームを取得（GP5000_10Fの子フレーム）
                    const gp10f = page.frames().find(f => f.url().includes('GP5000_10F'));
                    const menuFrame = gp10f?.childFrames().find(f => f.url().includes('GP5000_Menu'));
                    const fra1 = page.frame('fra_main1');
                    if (!menuFrame || !fra1) {
                        console.warn(`[奈良県] ${label}: フレーム取得失敗`);
                        continue;
                    }

                    // メニューから対象ページに遷移
                    // gyoshuKbnCd=00の案件情報=1番目, 入札結果=2番目, 01=3・4番目
                    const menuUrl = menuLabel === '案件情報'
                        ? `/DENCHO/GP5510_1010?gyoshuKbnCd=${gyoshuKbnCd}`
                        : `/DENCHO/GP5515_1010?gyoshuKbnCd=${gyoshuKbnCd}`;

                    await Promise.all([
                        fra1.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }),
                        menuFrame.evaluate((url: string) => (window as any).pf_VidDsp_btnReferenceClick(url), menuUrl),
                    ]);
                    await page.waitForTimeout(2000);

                    console.log(`[奈良県] ${label}: 検索フォーム URL=${fra1.url()}`);

                    // 年度フィルタを設定（入札結果は令和7年度=2025に限定）
                    if (filterYear) {
                        await fra1.selectOption('select[name="keisaiNen"]', filterYear).catch(() => { });
                        await page.waitForTimeout(300);
                    }

                    // 検索実行
                    await fra1.evaluate(() => {
                        const topW = window.top as any;
                        if (topW?.fra_hidden) topW.fra_hidden.submit_flag = 0;
                        (window as any).fnc_btnSearch_Clicked();
                    });
                    await fra1.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });
                    await page.waitForTimeout(2000);

                    console.log(`[奈良県] ${label}: 結果URL=${fra1.url()}`);

                    const totalPages = await getTotalPages(fra1);
                    const limitPages = maxPages > 0 ? Math.min(totalPages, maxPages) : totalPages;
                    console.log(`[奈良県] ${label}: ${totalPages}ページ（取得: ${limitPages}ページ）`);

                    // 1st pass: フィルタ済みの行を全ページから収集
                    const filteredRows: Array<RawRow & { announcementDate: string; biddingDate?: string }> = [];
                    for (let pageNum = 1; pageNum <= limitPages; pageNum++) {
                        if (pageNum > 1) {
                            const moved = await fra1.evaluate((n: number) => {
                                const fn = (window as any).pf_VidDsp_btnMovePage;
                                if (typeof fn === 'function') { fn(n); return true; }
                                return false;
                            }, pageNum);
                            if (!moved) break;
                            await fra1.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => { });
                            await page.waitForTimeout(1500);
                        }

                        const rows = await extractRows(fra1);
                        for (const row of rows) {
                            if (skipGyoshu && KOJI_GYOSHU_SKIP.some(kw => row.gyoshu.includes(kw))) continue;
                            if (!shouldKeepItem(row.title, row.gyoshu)) continue;
                            filteredRows.push({
                                ...row,
                                announcementDate: parsePpiDate(row.dateText),
                                biddingDate: row.bidDateText ? parsePpiDate(row.bidDateText) : undefined,
                            });
                        }
                        console.log(`[奈良県] ${label} p.${pageNum}: ${rows.length}行`);
                    }

                    // 2nd pass: 各案件を allItems へ追加
                    // 入札結果（落札）の場合は詳細ページ（GP5515_1020）から落札者を個別取得
                    for (const row of filteredRows) {
                        const detailUrl = `${PPI_BASE}/${detailBase}?ankenId=${row.ankenId}`;
                        let winningContractor: string | undefined;

                        if (status === '落札' && row.ankenId) {
                            try {
                                await fra1.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                                await page.waitForTimeout(800);
                                winningContractor = await extractContractorFromFrame(fra1);
                                console.log(`[奈良県] ${row.title.slice(0, 25)} → ${winningContractor || '落札者不明'}`);
                            } catch (e: any) {
                                console.warn(`[奈良県] 詳細ページ取得失敗: ${row.ankenId}`);
                            }
                        }

                        allItems.push({
                            id: `nara-pref-${row.ankenId || row.title.slice(0, 20)}`,
                            municipality: '奈良県',
                            title: row.title,
                            type,
                            announcementDate: row.announcementDate,
                            biddingDate: row.biddingDate,
                            link: detailUrl,
                            status,
                            winningContractor,
                            winnerType: type === '建築' ? 'ゼネコン' : '設計事務所',
                        });
                    }

                } catch (e: any) {
                    console.warn(`[奈良県] ${label} エラー:`, e.message?.split('\n')[0]);
                }
            }

        } catch (e: any) {
            console.error('[奈良県] スクレイパーエラー:', e.message || e);
        } finally {
            await browser.close();
        }

        // 重複をIDで除外
        const seen = new Set<string>();
        const unique = allItems.filter(item => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });

        console.log(`[奈良県] 合計 ${unique.length} 件`);
        return unique;
    }
}

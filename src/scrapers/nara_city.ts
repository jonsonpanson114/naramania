import { chromium } from 'playwright';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
// 奈良市の入札情報公開システム（efftis）
const EFFTIS_BASE = 'https://nara.efftis.jp/PPI/Public';
const EFFTIS_TOP = `${EFFTIS_BASE}/PPUBC00100?kikanno=0201`;

// 検索対象ページ（直接URL + chotatsu_kbn）
const SEARCH_TARGETS = [
    { screenId: 'PPUBC00400', chotatsu_kbn: '00', status: '受付中' as const, label: '建設工事/入札公告' },
    { screenId: 'PPUBC00700', chotatsu_kbn: '00', status: '落札' as const,  label: '建設工事/入札結果' },
    { screenId: 'PPUBC00400', chotatsu_kbn: '01', status: '受付中' as const, label: '業務委託/入札公告' },
    { screenId: 'PPUBC00700', chotatsu_kbn: '01', status: '落札' as const,  label: '業務委託/入札結果' },
];

// 土木系工種をスキップ
const SKIP_KOUSHUS = ['土木一式', '舗装工事', '法面工事', '河川', '砂防', '造園工事', '水道施設', '管工事', 'さく井', '電気通信工事'];

function shouldSkipKoushu(koushu: string): boolean {
    return SKIP_KOUSHUS.some(kw => koushu.includes(kw));
}

function parseJapaneseDate(text: string): string {
    const m = text.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (m) {
        const year = 2018 + parseInt(m[1]);
        return `${year}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }
    return new Date().toISOString().split('T')[0];
}

function classifyType(koushu: string, chotatsu: string): BiddingType {
    if (chotatsu === '01') return '委託'; // 業務委託カテゴリ
    if (koushu.includes('建築')) return '建築';
    if (koushu.includes('設計') || koushu.includes('測量') || koushu.includes('コンサル')) return 'コンサル';
    return '建築';
}

export class NaraCityScraper implements Scraper {
    municipality: '奈良市' = '奈良市';

    async scrape(): Promise<BiddingItem[]> {
        const browser = await chromium.launch({ headless: true });
        const allItems: BiddingItem[] = [];

        try {
            const page = await browser.newPage();

            for (const { screenId, chotatsu_kbn, status, label } of SEARCH_TARGETS) {
                console.log(`[奈良市] ${label} 取得中...`);
                try {
                    // トップページでセッション確立
                    await page.goto(EFFTIS_TOP, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await page.waitForTimeout(1000);

                    // 検索画面に直接ナビゲート
                    const searchUrl = `${EFFTIS_BASE}/PPUBC00100!link?screenId=${screenId}&chotatsu_kbn=${chotatsu_kbn}`;
                    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await page.waitForTimeout(1500);

                    // 50件表示に切り替え
                    await page.locator('select').last().selectOption('50').catch(() => {});
                    await page.waitForTimeout(500);

                    // 検索ボタンクリック（全角スペース）
                    await page.locator('input[value="検\u3000索"]').click({ timeout: 15000 });
                    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
                    await page.waitForTimeout(2000);

                    // テーブルの全行を取得
                    // 構造: 1案件=3行 (主行7セル → 提出期限1セル → 入札手段|公告日|開札日3セル)
                    const rows = await page.locator('table tr').all();
                    console.log(`[奈良市] ${label}: テーブル行数 ${rows.length}`);

                    for (let i = 0; i < rows.length - 2; i++) {
                        const cells = await rows[i].locator('td').all();
                        if (cells.length !== 7) continue; // 主行のみ処理

                        const contractNo = (await cells[0].innerText()).trim();
                        const title      = (await cells[2].innerText()).trim();
                        const koushu     = (await cells[3].innerText()).trim();

                        if (!title || !contractNo || contractNo.includes('契約番号')) continue;
                        if (shouldSkipKoushu(koushu)) continue;

                        // 次の次の行(i+2)から 入札手段|公告日|開札日 を取得
                        const dateCells = await rows[i + 2].locator('td').all();
                        const annoDate = dateCells.length >= 2
                            ? parseJapaneseDate((await dateCells[1].innerText()).trim())
                            : new Date().toISOString().split('T')[0];
                        const biddingDate = dateCells.length >= 3
                            ? parseJapaneseDate((await dateCells[2].innerText()).trim())
                            : undefined;

                        // 詳細リンク（件名列のa要素）
                        const linkEl = cells[2].locator('a').first();
                        let link = EFFTIS_TOP;
                        try {
                            const href = await linkEl.getAttribute('href');
                            if (href) link = href.startsWith('http') ? href : `${EFFTIS_BASE}/${href}`;
                        } catch { }

                        allItems.push({
                            id: `nara-city-${contractNo}`,
                            municipality: '奈良市',
                            title,
                            type: classifyType(koushu, chotatsu_kbn),
                            announcementDate: annoDate,
                            biddingDate,
                            link,
                            status,
                        });
                    }

                    console.log(`[奈良市] ${label}: ${allItems.length}件（累計）`);

                } catch (e: any) {
                    console.warn(`[奈良市] ${label} エラー:`, e.message?.split('\n')[0]);
                }
            }

        } catch (e: any) {
            console.error('[奈良市] スクレイパーエラー:', e.message || e);
        } finally {
            await browser.close();
        }

        console.log(`[奈良市] 合計 ${allItems.length} 件`);
        return allItems;
    }
}

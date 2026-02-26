import { chromium } from 'playwright';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';

// 田原本町の入札情報サービス（EffTis PPI）
const EFFTIS_BASE = 'https://tawaramoto.efftis.jp/PPI/Public';
const EFFTIS_TOP = `${EFFTIS_BASE}/PPUBC00100`;

const SEARCH_TARGETS = [
    { screenId: 'PPUBC00400', chotatsu_kbn: '00', status: '受付中' as const, label: '建設工事/入札公告' },
    { screenId: 'PPUBC00700', chotatsu_kbn: '00', status: '落札' as const, label: '建設工事/入札結果' },
    { screenId: 'PPUBC00400', chotatsu_kbn: '01', status: '受付中' as const, label: '委託業務/入札公告' },
    { screenId: 'PPUBC00700', chotatsu_kbn: '01', status: '落札' as const, label: '委託業務/入札結果' },
];

// スキップする工種
const SKIP_KOUSHUS = ['土木一式', '舗装', '機械器具設置', '鋼構造物', '河川', '砂防', '造園', '水道施設', '管工事', 'さく井', '電気通信'];

function shouldSkipKoushu(koushu: string): boolean {
    return SKIP_KOUSHUS.some(kw => koushu.includes(kw));
}

function parseJapaneseDate(text: string): string {
    const m = text.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (m) {
        const year = 2018 + parseInt(m[1]);
        return `${year}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }
    return '';
}

function classifyType(koushu: string, chotatsu: string): BiddingType {
    if (chotatsu === '01') return '委託';
    if (koushu.includes('建築')) return '建築';
    if (koushu.includes('設計') || koushu.includes('測量') || koushu.includes('コンサル')) return 'コンサル';
    return '建築';
}

export class TawaramotoTownScraper implements Scraper {
    municipality: '田原本町' = '田原本町';

    async scrape(): Promise<BiddingItem[]> {
        const browser = await chromium.launch({ headless: true });
        const allItems: BiddingItem[] = [];

        try {
            const page = await browser.newPage();

            // EffTis は Content-Type に Shift_JIS と宣言するが実態は UTF-8 → 強制上書き
            await page.route('**/*', async (route) => {
                const response = await route.fetch();
                const headers = response.headers();
                const contentType = headers['content-type'] || '';
                if (contentType.includes('text/html')) {
                    const buffer = await response.body();
                    await route.fulfill({
                        response,
                        body: buffer,
                        headers: { ...headers, 'content-type': 'text/html; charset=utf-8' }
                    });
                } else {
                    await route.fallback();
                }
            });

            for (const { screenId, chotatsu_kbn, status, label } of SEARCH_TARGETS) {
                console.log(`[田原本町] ${label} 取得中...`);
                try {
                    await page.goto(EFFTIS_TOP, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await page.waitForTimeout(1000);

                    const searchUrl = `${EFFTIS_BASE}/PPUBC00100!link?screenId=${screenId}&chotatsu_kbn=${chotatsu_kbn}`;
                    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await page.waitForTimeout(1500);

                    await page.locator('select').last().selectOption('50').catch(() => { });
                    await page.waitForTimeout(500);

                    await page.locator('input[value="検\u3000索"]').click({ timeout: 15000 });
                    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => { });
                    await page.waitForTimeout(2000);

                    // 奈良市と同じテーブル構造：1案件=2〜3行
                    const rows = await page.locator('table tr').all();
                    console.log(`[田原本町] ${label}: テーブル行数 ${rows.length}`);

                    for (let i = 0; i < rows.length - 1; i++) {
                        const cells = await rows[i].locator('td').all();
                        if (cells.length !== 7) continue;

                        const contractNo = (await cells[0].innerText()).trim();
                        const title = (await cells[2].innerText()).trim();
                        const koushu = (await cells[3].innerText()).trim();
                        // cells[5] は状況（「入札参加申請終了」等）で落札者ではない

                        if (!title || !contractNo || contractNo.includes('契約番号')) continue;
                        if (shouldSkipKoushu(koushu)) continue;

                        // 田原本町の行構造（常に3行）:
                        //   主行 (7セル): 契約番号|担当課|件名|工種|入札方式|状況|ボタン
                        //   サブ行1 (1セル): ステータス（「入札終了」等）
                        //   サブ行2 (4セル): 場所|電子|公告日|開札日
                        if (i + 2 >= rows.length) continue;
                        const dateCells = await rows[i + 2].locator('td').all();
                        if (dateCells.length < 3) continue;

                        const rawAnnoDate = parseJapaneseDate((await dateCells[2].innerText()).trim());
                        if (!rawAnnoDate) continue;
                        const annoDate = rawAnnoDate;
                        const bd = dateCells.length >= 4
                            ? parseJapaneseDate((await dateCells[3].innerText()).trim())
                            : '';
                        const biddingDate = bd || undefined;

                        const linkEl = cells[2].locator('a').first();
                        let link = EFFTIS_TOP;
                        try {
                            const href = await linkEl.getAttribute('href');
                            if (href) link = href.startsWith('http') ? href : `${EFFTIS_BASE}/${href}`;
                        } catch { }

                        allItems.push({
                            id: `tawaramoto-${contractNo}`,
                            municipality: '田原本町',
                            title,
                            type: classifyType(koushu, chotatsu_kbn),
                            announcementDate: annoDate,
                            biddingDate,
                            link,
                            status,
                        });
                    }

                    console.log(`[田原本町] ${label}: ${allItems.length}件（累計）`);

                } catch (e: any) {
                    console.warn(`[田原本町] ${label} エラー:`, e.message?.split('\n')[0]);
                }
            }

        } catch (e: any) {
            console.error('[田原本町] スクレイパーエラー:', e.message || e);
        } finally {
            await browser.close();
        }

        console.log(`[田原本町] 合計 ${allItems.length} 件`);
        return allItems;
    }
}

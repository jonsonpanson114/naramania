import { chromium } from 'playwright';
import { BiddingItem, Scraper } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

// 川西町入札情報ページ
// 令和7年度の過去の落札結果は、月別ページで公開されている
const BASE_URL = 'https://www.town.nara-kawanishi.lg.jp';
const RESULT_BASE = `${BASE_URL}/category/22-1-0-0-0-0-0-0-0.html`;

// スキップする工種・工事名キーワード
const SKIP_KEYWORDS = [
    '道路', '舗装', '下水道', '河川', '砂防', '水道', '管工事', '橋梁', '護岸',
    '側溝', '水路', '排水', 'マンホール', '配水管', '布設替', '管路', '電気通信',
    '造園', 'カルバート', '樋門', '土木', '舗装維持', '除草', 'バッテリー',
];

function shouldSkip(title: string): boolean {
    return !shouldKeepItem(title);
}

// "令和7年4月分" → "2025-04"
function parseMonth(yearText: string, month: string): string {
    const m = month.match(/(\d+)月/)?.[1];
    if (!m) return '';
    return `${yearText}-${String(m).padStart(2, '0')}`;
}

async function scrapeKawanishiCity(): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // トップページ（各月の入札結果ページ）
        await page.goto(RESULT_BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);

        // 各月の入札結果ページリンクを取得
        const monthLinks = await page.locator('a').all();
        console.log(`[川西町] 月リンク数: ${monthLinks.length}`);

        // 令和7年度（2025年4月〜2026年3月）のリンクを対象に
        for (const link of monthLinks) {
            const text = (await link.textContent() || '').trim();
            // 例: "令和7年4月分" → 対象
            if (!text.includes('令和7年')) continue;

            const href = await link.getAttribute('href') || '';
            if (!href || !href.includes('.html')) continue;

            // 月ページへ遷移
            await page.goto(`${BASE_URL}${href}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(2000);

            // ページタイトル（例: 令和7年4月分）
            const pageTitle = (await page.evaluate(() => document.querySelector('h1, h2, h3')?.textContent || '')).trim();
            console.log(`[川西町] ${pageTitle}`);

            // テーブルを探す
            const tables = await page.locator('table').all();
            console.log(`[川西町] テーブル数: ${tables.length}`);

            for (const table of tables) {
                const rows = await table.locator('tr').all();
                for (let i = 0; i < rows.length; i++) {
                    const cells = await rows[i].locator('td').all();
                    if (cells.length < 2) continue;

                    const title = (await cells[0].textContent() || '').trim().replace(/\s+/g, ' ');
                    const rightCell = cells.length >= 2 ? (await cells[cells.length - 1].textContent() || '').trim().replace(/\s+/g, ' ') : '';

                    if (!title || !rightCell) continue;
                    if (shouldSkip(title)) continue;

                    // 日付解析（ページタイトル等）
                    const dateMatch = pageTitle.match(/(令和)?(\d+)年(\d+)月/);
                    let announcementDate = '';
                    if (dateMatch) {
                        let y = parseInt(dateMatch[2]);
                        if (dateMatch[1] === '令和' || pageTitle.includes('令和')) y += 2018;
                        announcementDate = `${y}-${String(dateMatch[3]).padStart(2, '0')}-01`;
                    } else {
                        // デフォルト
                        announcementDate = new Date().toISOString().split('T')[0];
                    }

                    items.push({
                        id: `kawanishi-${announcementDate}-${title.slice(0, 15)}`,
                        municipality: '川西町',
                        title,
                        type: '建築',
                        announcementDate,
                        link: `${BASE_URL}${href}`,
                        status: '落札',
                    });
                }
            }
        }

    } catch (e: any) {
        console.error('[川西町] エラー:', e.message || e);
    } finally {
        await browser.close();
    }

    console.log(`[川西町] 合計 ${items.length} 件`);
    return items;
}

export class KawanishiCityScraper implements Scraper {
    municipality: '川西町' = '川西町';

    async scrape(): Promise<BiddingItem[]> {
        return scrapeKawanishiCity();
    }
}

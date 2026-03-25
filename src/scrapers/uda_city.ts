import { chromium } from 'playwright';
import type { Locator, Page, Frame } from 'playwright';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
import crypto from 'crypto';
import { shouldKeepItem } from './common/filter';

// 宇陀市の入札情報公開システム（epi-cloud）
const EPI_CLOUD_FORM = 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200700';
const EPI_BASE = 'https://www.epi-cloud.fwd.ne.jp';

function parseJapaneseDate(text: string): string {
    const m = text.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (m) {
        const year = 2018 + parseInt(m[1]);
        return `${year}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }
    const m2 = text.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (m2) return `${m2[1]}-${m2[2].padStart(2, '0')}-${m2[3].padStart(2, '0')}`;
    return new Date().toISOString().split('T')[0];
}

function classifyType(title: string, gyoshu: string): BiddingType {
    const t = title + gyoshu;
    if (t.includes('設計') || t.includes('測量') || t.includes('コンサル') || t.includes('地質')) return 'コンサル';
    if (t.includes('委託') || t.includes('業務')) return '委託';
    return '建築';
}

async function extractFromResultsPage(context: Page | Frame, status: '受付中' | '落札'): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];
    try {
        let links: Locator[] = [];
        await context.waitForTimeout(10000);

        // Try to find links in child frames if context is Page, otherwise search directly
        const frames = 'frames' in context ? context.frames() : [];
        if (frames.length > 0) {
            for (const f of frames) {
                try {
                    const found = await f.locator('table a').all().catch(() => []);
                    if (found.length > links.length) {
                        links = found;
                    }
                } catch {
                    // Skip frames that can't be accessed
                }
            }
        } else {
            // Search directly in the context (if it's a Frame)
            links = await context.locator('table a').all().catch(() => []);
        }

        console.log(`[宇陀市] 結果フレーム発見: リンク数 ${links.length}`);

        for (const link of links) {
            const text = (await link.textContent())?.trim() || '';
            if (!text || text.length < 5) continue;

            const href = await link.getAttribute('href');
            if (!href) continue;

            const fullLink = href.startsWith('http') ? href : `${EPI_BASE}${href}`;
            const row = link.locator('xpath=ancestor::tr').first();
            const cells = await row.locator('td').all().catch(() => []);

            let dateText = '';
            let gyoshu = '';
            if (cells.length >= 3) {
                dateText = (await cells[cells.length - 1].innerText().catch(() => '')).trim();
                gyoshu = (await cells[1]?.innerText().catch(() => '') || '').trim();
            }

            if (!shouldKeepItem(text, gyoshu)) {
                continue;
            }

            items.push({
                id: `uda-${crypto.createHash('md5').update(text + fullLink).digest('hex').slice(0, 8)}`,
                municipality: '宇陀市',
                title: text,
                type: classifyType(text, gyoshu),
                announcementDate: parseJapaneseDate(dateText),
                link: fullLink,
                status,
            });
        }
    } catch (e: unknown) {
        console.warn('[宇陀市] 結果ページ抽出エラー:', e instanceof Error ? e instanceof Error ? e.message : String(e).split('\n')[0] : String(e));
    }
    return items;
}

export class UdaCityScraper implements Scraper {
    municipality: '宇陀市' = '宇陀市' as const;

    async scrape(): Promise<BiddingItem[]> {
        const browser = await chromium.launch({ headless: true });
        const allItems: BiddingItem[] = [];

        try {
            const page = await browser.newPage();
            page.setDefaultTimeout(120000);

            const categories = [
                { btnText: '工事', status: '受付中' as const },
                { btnText: 'コンサル', status: '受付中' as const },
            ];

            for (const { btnText, status } of categories) {
                try {
                    console.log(`\n[宇陀市] --- ${btnText} カテゴリ開始 ---`);
                    await page.goto(EPI_CLOUD_FORM, { waitUntil: 'load' });
                    await page.waitForTimeout(10000);

                    const catSelector = `span:has-text("${btnText}"), a:has-text("${btnText}"), td:has-text("${btnText}")`;
                    await page.locator(catSelector).first().click({ force: true, timeout: 30000 });
                    console.log(`[宇陀市] ${btnText} をクリック。`);
                    await page.waitForTimeout(20000);

                    let menuFound = false;
                    for (const frame of page.frames()) {
                        const menuSelectors = [
                            'a:has-text("発注情報の検索")', 
                            'a:has-text("発注情報検索")',
                            'img[alt*="発注情報検索"]',
                            'td:has-text("発注情報")',
                            'span:has-text("発注情報")'
                        ];
                        
                        for (const sel of menuSelectors) {
                            const entry = frame.locator(sel).first();
                            if (await entry.count() > 0) {
                                console.log(`[宇陀市] メニュー発見: ${sel} (Frame: ${frame.name()})`);
                                await entry.click({ force: true, timeout: 30000 });
                                menuFound = true;
                                break;
                            }
                        }
                        if (menuFound) break;
                    }

                    if (!menuFound) {
                        console.warn(`[宇陀市] ${btnText}: メニューが見つかりません。`);
                        continue;
                    }

                    await page.waitForTimeout(15000);

                    let searchExecuted = false;
                    const searchSelectors = [
                        'input[value*="検索"]',
                        'button:has-text("検索")',
                        'img[alt*="検索"]',
                        'a:has-text("検索")'
                    ];

                    for (const frame of page.frames()) {
                        for (const sel of searchSelectors) {
                            const btn = frame.locator(sel).first();
                            if (await btn.count() > 0) {
                                console.log(`[宇陀市] 検索ボタン発見: ${sel} (Frame: ${frame.name()})`);
                                await btn.click({ force: true, timeout: 30000 });
                                searchExecuted = true;
                                await page.waitForTimeout(15000);
                                const items = await extractFromResultsPage(frame, status);
                                allItems.push(...items);
                                break;
                            }
                        }
                        if (searchExecuted) break;
                    }

                    if (!searchExecuted) {
                        console.warn(`[宇陀市] ${btnText}: 検索ボタンが見つかりません。`);
                    }

                } catch (e: unknown) {
                    console.warn(`[宇陀市] ${btnText} カテゴリエラー:`, e instanceof Error ? e instanceof Error ? e.message : String(e).split('\n')[0] : String(e));
                }
            }

        } catch (error: unknown) {
            console.error('[宇陀市] スクレイパーエラー:', error instanceof Error ? error.message : String(error));
        } finally {
            await browser.close();
        }

        console.log(`[宇陀市] 合計 ${allItems.length} 件取得`);
        return allItems;
    }
}

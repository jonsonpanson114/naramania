import { chromium } from 'playwright';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
import crypto from 'crypto';
import { shouldKeepItem } from './common/filter';

// 生駒市の入札情報公開システム（epi-cloud）
// 構造: 機関選択フォーム → 工事/コンサル ボタン → 案件一覧
const EPI_CLOUD_FORM = 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680';
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

    return false; // Deprecated in favor of shouldKeepItem
}

async function extractFromResultsPage(page: any, status: '受付中' | '落札'): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];
    try {
        // 案件一覧テーブルを探す（data行はリンクを含む）
        const links = await page.locator('table a').all();
        if (links.length === 0) {
            console.log('[生駒市] 案件リンクが見つかりません（現在公開中の案件なし）');
            return items;
        }

        for (const link of links) {
            const text = (await link.textContent())?.trim() || '';
            if (!text || text.length < 5) continue;

            const href = await link.getAttribute('href');
            if (!href) continue;

            const fullLink = href.startsWith('http') ? href : `${EPI_BASE}${href}`;
            const row = link.locator('xpath=ancestor::tr').first();
            const cells = await row.locator('td').all();

            let dateText = '';
            let gyoshu = '';
            if (cells.length >= 3) {
                dateText = (await cells[cells.length - 1].innerText()).trim();
                gyoshu = (await cells[1].innerText()).trim();
            }

            if (!shouldKeepItem(text, gyoshu)) {
                console.log(`[生駒市] スキップ（ノイズ）: ${text}`);
                continue;
            }

            items.push({
                id: `ikoma-${crypto.createHash('md5').update(text + fullLink).digest('hex').slice(0, 8)}`,
                municipality: '生駒市',
                title: text,
                type: classifyType(text, gyoshu),
                announcementDate: parseJapaneseDate(dateText),
                link: fullLink,
                status,
            });
        }
    } catch (e: any) {
        console.warn('[生駒市] 結果ページ抽出エラー:', e.message?.split('\n')[0]);
    }
    return items;
}

export class IkomaCityScraper implements Scraper {
    municipality: '生駒市' = '生駒市';

    async scrape(): Promise<BiddingItem[]> {
        const browser = await chromium.launch({ headless: true });
        const allItems: BiddingItem[] = [];

        try {
            const page = await browser.newPage();

            // フォームページに移動
            console.log('[生駒市] epi-cloudフォームにアクセス中...');
            const res = await page.goto(EPI_CLOUD_FORM, { waitUntil: 'domcontentloaded', timeout: 30000 });
            if (!res || res.status() >= 400) {
                throw new Error(`HTTP ${res?.status()}: epi-cloudにアクセスできません`);
            }
            await page.waitForTimeout(2000);

            // 対象カテゴリ（工事・コンサル）
            const categories = [
                { btnText: '工事', status: '受付中' as const },
                { btnText: 'コンサル', status: '受付中' as const },
            ];

            for (const { btnText, status } of categories) {
                try {
                    // フォームページに戻る
                    await page.goto(EPI_CLOUD_FORM, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await page.waitForTimeout(1500);

                    // カテゴリボタンをクリック → KK000ShowAction（検索フォーム付き一覧）へ遷移
                    await page.getByText(btnText, { exact: true }).click({ timeout: 5000 });
                    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
                    await page.waitForTimeout(1500);

                    console.log(`[生駒市] ${btnText}: URL=${page.url()}`);

                    // フレームが完全に読み込まれるまで待機
                    await page.waitForLoadState('load', { timeout: 20000 }).catch(() => {});
                    await page.waitForTimeout(3000);

                    // koukai_mainフレームのHTML本文を取得
                    const mainFrame = page.frames().find(f => f.url().includes('koukai_main'));
                    if (mainFrame) {
                        await mainFrame.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
                        const html = await mainFrame.content();
                        // body部分だけ抽出（最大3000文字）
                        const bodyMatch = html.match(/<body[^>]*>([\s\S]{0,3000})/i);
                        console.log(`[生駒市] ${btnText}: koukai_main body=${bodyMatch ? bodyMatch[1].replace(/\s+/g, ' ') : 'なし'}`);
                    }

                    // KK000ShowAction上の検索フォームを空のまま送信して全件表示
                    // epi-cloudはinput[type="button"]を使うことが多い
                    const searchBtn = page.locator('input[value*="検索"], input[value*="検　索"], button:has-text("検索")').first();
                    if (await searchBtn.count() > 0) {
                        console.log(`[生駒市] ${btnText}: 検索ボタンをクリック`);
                        await searchBtn.click({ timeout: 5000 }).catch(() => {});
                        await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
                        await page.waitForSelector('table', { timeout: 15000 }).catch(() => {});
                        await page.waitForTimeout(2000);
                    } else {
                        console.log(`[生駒市] ${btnText}: 検索ボタンなし、現在のページをそのまま解析`);
                        await page.waitForSelector('table', { timeout: 15000 }).catch(() => {});
                        await page.waitForTimeout(1000);
                    }

                    const items = await extractFromResultsPage(page, status);
                    allItems.push(...items);
                    console.log(`[生駒市] ${btnText}: ${items.length}件`);

                } catch (e: any) {
                    console.warn(`[生駒市] ${btnText} エラー:`, e.message?.split('\n')[0]);
                }
            }

        } catch (e: any) {
            console.error('[生駒市] スクレイパーエラー:', e.message || e);
        } finally {
            await browser.close();
        }

        console.log(`[生駒市] 合計 ${allItems.length} 件`);
        return allItems;
    }
}

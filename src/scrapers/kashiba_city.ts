import { chromium } from 'playwright';
import { BiddingItem, Scraper } from '../types/bidding';

const EPI_URL = 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=062006E007200640';

// 令和7年度 = 2025年度
const NENDO = '2025';

// スキップする工種・工事名キーワード（土木系）
const SKIP_KEYWORDS = [
    '舗装', '道路', '下水道', '河川', '砂防', '水道', '管工事', '橋梁', '護岸',
    '側溝', '水路', '排水', 'マンホール', '配水管', '布設替', '管路', '電気通信',
    '造園', 'カルバート', '樋門', '土木', '舗装維持',
];

function shouldSkip(title: string): boolean {
    return SKIP_KEYWORDS.some(kw => title.includes(kw));
}

function parseJpDate(str: string): string {
    // "2025/06/15" → "2025-06-15"
    const m = str.trim().match(/(\d{4})\/(\d{2})\/(\d{2})/);
    if (!m) return '';
    return `${m[1]}-${m[2]}-${m[3]}`;
}


async function scrapeKashibaCity(): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];
    const nendo = NENDO; // 固定。毎年更新必要

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // 1) 初期フォームへアクセス（セッション確立）
        await page.goto(EPI_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1500);

        // 2) bukyoku = 総務部 (179205ZZZZ) を選択
        const bukyokuSel = page.locator('select[name="bukyoku"]');
        if (await bukyokuSel.count() > 0) {
            await bukyokuSel.selectOption('179205ZZZZ');
            await page.waitForTimeout(500);
        }

        // 3) 「工事」をクリック
        await page.locator('span.ATYPE:has-text("工事")').first().click();
        await page.waitForTimeout(4000);

        // 4) frmRIGHT: 入札・契約結果情報の検索
        const rightFrame = page.frames().find(f => f.name() === 'frmRIGHT');
        if (!rightFrame) {
            console.warn('[香芝市] frmRIGHT が見つかりません');
            return items;
        }
        await rightFrame.locator('span.ATYPE:has-text("入札・契約結果情報")').first().click();
        await page.waitForTimeout(4000);

        // 5) 検索フォーム (KK401ShowAction) で年度選択 + 検索
        const searchFrame = page.frames().find(f => f.name() === 'frmRIGHT');
        if (!searchFrame) {
            console.warn('[香芝市] 検索フォームが見つかりません');
            return items;
        }

        await searchFrame.selectOption('select[name="nendo"]', nendo).catch(() => {});
        await searchFrame.locator('input[type=button][value="検索"]').first().click();
        await page.waitForTimeout(5000);

        // 6) データiframe (KFK401FrameShow or name='right') からデータ取得
        let page_num = 1;
        while (true) {
            const dataFrame = page.frames().find(f =>
                f.url().includes('KFK4') || f.name() === 'right'
            );
            if (!dataFrame) {
                console.warn('[香芝市] データフレームが見つかりません');
                break;
            }

            const rows = await dataFrame.locator('table tr').all();
            let rowCount = 0;

            for (const row of rows) {
                const cells = await row.locator('td').all();
                if (cells.length < 7) continue;

                // col: 0=結果種別, 1=公開日, 2=工事名, 3=契約管理番号, 4=入札方式, 5=落札者, 6=金額, 7=課所名
                const pubDate = parseJpDate((await cells[1].textContent() || '').trim());
                const title = (await cells[2].textContent() || '').trim().replace(/\s+/g, ' ');
                const contractNo = (await cells[3].textContent() || '').trim().replace(/\s+/g, '');
                const winner = cells.length >= 6 ? (await cells[5].textContent() || '').trim().replace(/\s+/g, ' ') : '';
                const amountText = cells.length >= 7 ? (await cells[6].textContent() || '').trim().replace(/[,円\s]/g, '') : '';

                if (!title || !pubDate) continue;
                if (shouldSkip(title)) continue;

                items.push({
                    id: `kashiba-${contractNo || pubDate + '-' + title.slice(0, 10)}`,
                    municipality: '香芝市',
                    title,
                    type: '建築',
                    announcementDate: pubDate,
                    biddingDate: pubDate,
                    link: EPI_URL,
                    status: '落札',
                    winningContractor: winner || undefined,
                    estimatedPrice: amountText ? `${parseInt(amountText).toLocaleString()}円` : undefined,
                });
                rowCount++;
            }

            // ページネーション: データフレーム内の「次へ」リンクを確認
            const nextLink = dataFrame.locator('a:has-text("次へ")').first();
            if (await nextLink.count() === 0) break;

            page_num++;
            console.log(`[香芝市] ページ ${page_num} へ`);
            await nextLink.click();
            await page.waitForTimeout(4000);
        }

    } catch (e: any) {
        console.error('[香芝市] エラー:', e.message || e);
    } finally {
        await browser.close();
    }

    console.log(`[香芝市] 合計 ${items.length} 件`);
    return items;
}

export class KashibaCityScraper implements Scraper {
    municipality: '香芝市' = '香芝市';

    async scrape(): Promise<BiddingItem[]> {
        return scrapeKashibaCity();
    }
}

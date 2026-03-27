import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { chromium } from 'playwright';
import { BiddingItem, Scraper } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

const EPI_URL = 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=062006E007200640';

// 令和6年度(2024), 令和7年度(2025), 令和8年度(2026予測) を対象にする
const NENDOS = ['2026', '2025', '2024'];

function parseJpDate(str: string): string {
    const m = str.trim().match(/(\d{4})\/(\d{2})\/(\d{2})/);
    if (!m) return '';
    return `${m[1]}-${m[2]}-${m[3]}`;
}

async function scrapeKashibaCity(): Promise<BiddingItem[]> {
    const itemsMap = new Map<string, BiddingItem>();

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // 1) 初期フォームへアクセス
        await page.goto(EPI_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1500);

        // 2) 「工事」をクリック
        await page.locator('span.ATYPE:has-text("工事")').first().click();
        await page.waitForTimeout(4000);

        // 3) 部局 = 「香芝市」全体（1792ZZZZZZ）を選択（もしあれば）
        // 以前の 179205ZZZZ より広い可能性がある
        const bukyokuSel = page.locator('select[name="bukyoku"]');
        if (await bukyokuSel.count() > 0) {
            await bukyokuSel.selectOption('1792ZZZZZZ').catch(() => bukyokuSel.selectOption({ index: 0 }));
            await page.waitForTimeout(1000);
        }

        for (const nendo of NENDOS) {
            console.log(`[香芝市] 年度 ${nendo} 検索中...`);
            // 4) frmRIGHT: 入札・契約結果情報の検索
            let rightFrame = page.frames().find(f => f.name() === 'frmRIGHT');
            if (!rightFrame) {
                console.warn('[香芝市] frmRIGHT が見つかりません');
                continue;
            }
            await rightFrame.locator('span.ATYPE:has-text("入札・契約結果情報")').first().click();
            await page.waitForTimeout(4000);

            // Re-find rightFrame as navigation might have changed it
            rightFrame = page.frames().find(f => f.name() === 'frmRIGHT');
            if (!rightFrame) continue;

            // 年度選択
            const nendoExists = await rightFrame.locator(`select[name="nendo"] option[value="${nendo}"]`).count();
            if (nendoExists === 0) {
                console.log(`[香芝市] 年度 ${nendo} は選択肢にありません`);
                continue;
            }
            await rightFrame.selectOption('select[name="nendo"]', nendo);
            await rightFrame.locator('input[type=button][value="検索"]').first().click();
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
                    if (!shouldKeepItem(title)) continue;

                    const id = `kashiba-${contractNo || pubDate + '-' + title.slice(0, 10)}`;
                    itemsMap.set(id, {
                        id,
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
                }

                // ページネーション: データフレーム内の「次へ」リンクを確認
                const nextLink = dataFrame.locator('a:has-text("次へ")').first();
                if (await nextLink.count() === 0) break;

                page_num++;
                console.log(`[香芝市] ページ ${page_num} へ`);
                await nextLink.click();
                await page.waitForTimeout(4000);
            }

            // 検索画面に戻るために一旦初期画面へ
            await page.goto(EPI_URL, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(1000);
            await page.locator('span.ATYPE:has-text("工事")').first().click();
            await page.waitForTimeout(2000);
        }

    } catch (e: unknown) {
        console.error('[香芝市] エラー:', e instanceof Error ? e.message : String(e) || e);
    } finally {
        await browser.close();
    }

    console.log(`[香芝市] 合計 ${itemsMap.size} 件`);
    return Array.from(itemsMap.values());
}

async function scrapeKashibaWebsite(): Promise<BiddingItem[]> {
    const KASHIBA_PORTAL = 'https://www.city.kashiba.lg.jp/soshiki/7/7472.html';
    const items: BiddingItem[] = [];
    try {
        const res = await axios.get(KASHIBA_PORTAL, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 });
        const $ = cheerio.load(res.data);
        const links: { title: string; href: string }[] = [];

        // 令和7年度/6年度の入札公告、結果ページへのリンクを探す
        $('a').each((_: number, el: any) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href') || '';
            if (!href) return;
            // 「公告」という文字があれば対象（例：3月26日公告分）
            if (text.includes('公告') || text.includes('結果')) {
                const fullUrl = href.startsWith('http') ? href : 'https://www.city.kashiba.lg.jp' + href;
                links.push({ title: text, href: fullUrl });
            }
        });

        // 重複を除いて上位数ページを深掘り
        const targetLinks = links.slice(0, 5); // 最新の5件分（約1ヶ月分）に絞る
        for (const link of targetLinks) {
            const pageRes = await axios.get(link.href, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 });
            const $p = cheerio.load(pageRes.data);
            
            // ページ内のテーブル（入札案件一覧）を解析
            $p('#main table tr').each((i: number, el: any) => {
                const cells = $p(el).find('td');
                if (cells.length < 2) return;

                const text = cells.eq(1).text().trim(); // 案件名
                const firstLink = $p(el).find('a').first();
                const href = firstLink.attr('href') || link.href;
                
                if (text.length < 5) return;

                if (shouldKeepItem(text)) {
                    // タイトルのクリーンアップ（[PDFファイル...] などを削除）
                    const cleanTitle = text.replace(/\[(PDF|Excel)ファイル.*?\]/g, '').trim() || text;
                    const isResult = cleanTitle.includes('結果') || link.title.includes('結果');
                    const fullUrl = href.startsWith('http') ? href : 'https://www.city.kashiba.lg.jp' + href;
                    
                    // 日付抽出
                    let date = '2025-03-01'; 
                    const m1 = link.title.match(/(?:令和|R)(\d+)年(\d+)月(\d+)日/);
                    const m2 = link.title.match(/(\d+)月(\d+)日(?:公告|結果)/);

                    if (m1) {
                        const year = 2018 + parseInt(m1[1]);
                        date = `${year}-${m1[2].padStart(2, '0')}-${m1[3].padStart(2, '0')}`;
                    } else if (m2) {
                        const month = parseInt(m2[1]);
                        const day = parseInt(m2[2]);
                        const year = month <= 3 ? 2026 : 2025;
                        date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    }

                    const id = `kashiba-web-${crypto.createHash('md5').update(cleanTitle + fullUrl).digest('hex').slice(0, 8)}`;
                    
                    if (!items.some(i => i.id === id)) {
                        items.push({
                            id,
                            municipality: '香芝市',
                            title: cleanTitle,
                            type: '建築',
                            announcementDate: date,
                            link: fullUrl,
                            status: isResult ? '落札' : '受付中',
                        });
                    }
                }
            });
            await new Promise(r => setTimeout(r, 200));
        }
    } catch (e) {
        console.error('[香芝市Web] エラー:', e);
    }
    return items;
}

export class KashibaCityScraper implements Scraper {
    municipality: '香芝市' = '香芝市' as const;

    async scrape(): Promise<BiddingItem[]> {
        const epiItems = await scrapeKashibaCity();
        const webItems = await scrapeKashibaWebsite();
        console.log(`[香芝市] 合計: ${epiItems.length + webItems.length} 件 (EPI:${epiItems.length}, Web:${webItems.length})`);
        return [...epiItems, ...webItems];
    }
}

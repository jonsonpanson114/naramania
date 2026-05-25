import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import type { Element } from 'domhandler';
import { chromium } from 'playwright';
import type { Frame, Page } from 'playwright';
import { BiddingItem, Scraper } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

const EPI_URL = 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=062006E007200640';

// 令和6年度(2024), 令和7年度(2025), 令和8年度(2026予測) を対象にする
const NENDOS = ['2026', '2025', '2024'];
const KASHIBA_KNOWN_SCHEDULES: Record<string, { announcementDate?: string; biddingDate: string; link?: string }> = {
    '香芝市立認定こども園及び幼稚園照明設備改修工事': {
        announcementDate: '2026-04-23',
        biddingDate: '2026-05-19',
        link: 'https://www.city.kashiba.lg.jp/site/nyuusatsu/65857.html',
    },
    '香芝市立小学校屋内運動場空調設備設置工事（1工区）': {
        announcementDate: '2026-04-16',
        biddingDate: '2026-05-19',
        link: 'https://www.city.kashiba.lg.jp/site/nyuusatsu/65649.html',
    },
    '香芝市立小学校屋内運動場空調設備設置工事（2工区）': {
        announcementDate: '2026-04-16',
        biddingDate: '2026-05-19',
        link: 'https://www.city.kashiba.lg.jp/site/nyuusatsu/65649.html',
    },
    '香芝市立小学校屋内運動場空調設備設置工事（3工区）': {
        announcementDate: '2026-04-16',
        biddingDate: '2026-05-19',
        link: 'https://www.city.kashiba.lg.jp/site/nyuusatsu/65649.html',
    },
    '香芝市立小学校照明設備改修工事（1工区）': {
        announcementDate: '2026-04-16',
        biddingDate: '2026-05-19',
        link: 'https://www.city.kashiba.lg.jp/site/nyuusatsu/65649.html',
    },
    '香芝市立小学校照明設備改修工事（2工区）': {
        announcementDate: '2026-04-16',
        biddingDate: '2026-05-19',
        link: 'https://www.city.kashiba.lg.jp/site/nyuusatsu/65649.html',
    },
    '香芝市立中学校照明設備改修工事（1工区）': {
        announcementDate: '2026-04-16',
        biddingDate: '2026-05-19',
        link: 'https://www.city.kashiba.lg.jp/site/nyuusatsu/65649.html',
    },
    '香芝市立中学校照明設備改修工事（2工区）': {
        announcementDate: '2026-04-16',
        biddingDate: '2026-05-19',
        link: 'https://www.city.kashiba.lg.jp/site/nyuusatsu/65649.html',
    },
    '三和小学校校舎増築工事に伴う設計業務': {
        announcementDate: '2026-04-09',
        biddingDate: '2026-04-28',
        link: 'https://www.city.kashiba.lg.jp/soshiki/7/65410.html',
    },
};

function inferKashibaType(title: string): '建築' | 'コンサル' {
    return title.includes('設計') ? 'コンサル' : '建築';
}

function buildKnownKashibaItems(): BiddingItem[] {
    return Object.entries(KASHIBA_KNOWN_SCHEDULES).map(([title, schedule]) => ({
        id: `kashiba-web-${crypto.createHash('md5').update(title + (schedule.link || '')).digest('hex').slice(0, 8)}`,
        municipality: '香芝市',
        title,
        type: inferKashibaType(title),
        announcementDate: schedule.announcementDate || '2026-01-01',
        biddingDate: schedule.biddingDate,
        link: schedule.link || '',
        status: '受付中',
    }));
}

function parseJpDate(str: string): string {
    const m = str.trim().match(/(\d{4})\/(\d{2})\/(\d{2})/);
    if (!m) return '';
    return `${m[1]}-${m[2]}-${m[3]}`;
}

function parseImperialDate(text: string): string {
    const match = text.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (!match) return '';
    const year = 2018 + parseInt(match[1], 10);
    return `${year}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function parsePageYear(html: string): number {
    const updateMatch = html.match(/更新日[:：]\s*(\d{4})年/);
    if (updateMatch) return parseInt(updateMatch[1], 10);

    const now = new Date();
    return now.getFullYear();
}

async function getRightFrame(page: Page): Promise<Frame | null> {
    for (let i = 0; i < 20; i += 1) {
        const frame = page.frames().find(candidate => candidate.name() === 'frmRIGHT');
        if (frame) return frame;
        await page.waitForTimeout(500);
    }
    return null;
}

async function openKashibaIssuePage(page: Page): Promise<Frame | null> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        await page.goto(EPI_URL, { waitUntil: 'load', timeout: 30000 });
        await page.waitForTimeout(1500);

        const serviceText = ((await page.locator('body').textContent().catch(() => '')) || '').replace(/\s+/g, ' ');
        if (serviceText.includes('サービス停止中') && serviceText.includes('情報公開')) {
            console.warn('[香芝市] EPI 情報公開サービス停止中のため取得をスキップします。');
            return null;
        }

        const category = page.locator('span.ATYPE').filter({ hasText: '工事' }).first();
        if (await category.count() === 0) {
            await page.waitForTimeout(1000);
            continue;
        }

        await category.click({ force: true, timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(2500);

        const rightFrame = await getRightFrame(page);
        if (rightFrame) return rightFrame;
    }

    return null;
}

async function scrapeKashibaCity(): Promise<BiddingItem[]> {
    const itemsMap = new Map<string, BiddingItem>();

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(120000);

    try {
        const initialRightFrame = await openKashibaIssuePage(page);
        if (!initialRightFrame) {
            return [];
        }

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
            let rightFrame = await getRightFrame(page);
            if (!rightFrame) {
                console.warn('[香芝市] frmRIGHT が見つかりません');
                rightFrame = await openKashibaIssuePage(page);
                if (!rightFrame) continue;
            }
            await rightFrame.locator('span.ATYPE:has-text("入札・契約結果情報")').first().click();
            await page.waitForTimeout(4000);

            // Re-find rightFrame as navigation might have changed it
            rightFrame = await getRightFrame(page);
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
                    const rawWinner = cells.length >= 6 ? (await cells[5].textContent() || '').trim().replace(/\s+/g, ' ') : '';
                    const winner = rawWinner === '-' ? '' : rawWinner;
                    const amountText = cells.length >= 7 ? (await cells[6].textContent() || '').trim().replace(/[,円\s]/g, '') : '';
                    const parsedAmount = amountText ? parseInt(amountText, 10) : Number.NaN;

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
                        estimatedPrice: Number.isFinite(parsedAmount) ? `${parsedAmount.toLocaleString()}円` : undefined,
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
            await openKashibaIssuePage(page);
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
    const KASHIBA_PORTALS = [
        'https://www.city.kashiba.lg.jp/site/nyuusatsu/list288-1032.html',
        'https://www.city.kashiba.lg.jp/site/nyuusatsu/list288-1034.html',
        'https://www.city.kashiba.lg.jp/site/nyuusatsu/65646.html',
    ];
    const items: BiddingItem[] = [];
    try {
        const links: { title: string; href: string }[] = [];

        for (const portalUrl of KASHIBA_PORTALS) {
            const res = await axios.get(portalUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 });
            const $ = cheerio.load(res.data);

            $('a').each((_: number, el: Element) => {
                const text = $(el).text().trim();
                const href = $(el).attr('href') || '';
                if (!href) return;
                if (!text.includes('一般競争入札') && !text.includes('入札結果')) return;

                const fullUrl = href.startsWith('http') ? href : 'https://www.city.kashiba.lg.jp' + href;
                links.push({ title: text, href: fullUrl });
            });
        }

        // 重複を除いて全ページを深掘り
        const targetLinks = Array.from(new Map(links.map(link => [link.href, link])).values());
        for (const link of targetLinks) {
            try {
                const pageRes = await axios.get(link.href, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 });
                const $p = cheerio.load(pageRes.data);
                const pageYear = parsePageYear(pageRes.data);
                const updatedMatch = $p('body').text().match(/更新日[:：]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
                const detailAnnouncementDate = updatedMatch
                    ? `${updatedMatch[1]}-${updatedMatch[2].padStart(2, '0')}-${updatedMatch[3].padStart(2, '0')}`
                    : '';

                let foundStructuredRows = false;

                $p('table').each((_: number, table: Element) => {
                    const rows = $p(table).find('tr').toArray();
                    if (rows.length < 2) return;

                    const header = $p(rows[0]).find('th,td').map((_, cell) => $p(cell).text().replace(/\s+/g, ' ').trim()).get();
                    const biddingDateIdx = header.findIndex(text => text.includes('開札日'));
                    const titleIdx = header.findIndex(text => text.includes('案件名') || text.includes('業務名') || text.includes('工事名'));

                    if (biddingDateIdx < 0 || titleIdx < 0) return;
                    foundStructuredRows = true;

                    rows.slice(1).forEach(row => {
                        const cells = $p(row).find('td').map((_, cell) => $p(cell).text().replace(/\s+/g, ' ').trim()).get();
                        if (cells.length <= Math.max(biddingDateIdx, titleIdx)) return;

                        const rawTitle = cells[titleIdx] || '';
                        const cleanTitle = rawTitle.replace(/\[(PDF|Excel)ファイル.*?\]/g, '').trim() || rawTitle;
                        const rawBiddingDate = cells[biddingDateIdx] || '';

                        if (!cleanTitle || !shouldKeepItem(cleanTitle)) return;

                        const biddingDate = parseImperialDate(rawBiddingDate)
                            || parseJpDate(rawBiddingDate.replace(/年|月/g, '/').replace(/日/g, ''));
                        const id = `kashiba-web-${crypto.createHash('md5').update(cleanTitle + link.href).digest('hex').slice(0, 8)}`;

                        if (!items.some(i => i.id === id)) {
                            items.push({
                                id,
                                municipality: '香芝市',
                                title: cleanTitle,
                                type: '建築',
                                announcementDate: detailAnnouncementDate || '2026-01-01',
                                biddingDate: biddingDate || undefined,
                                link: link.href,
                                status: link.title.includes('結果') ? '落札' : '受付中',
                            });
                        }
                    });
                });

                if (foundStructuredRows) {
                    await new Promise(r => setTimeout(r, 200));
                    continue;
                }
            
                // ページ内のテーブル（入札案件一覧）を解析
                $p('#main table tr').each((i: number, el: Element) => {
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
                            const year = pageYear;
                            date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        }

                        const id = `kashiba-web-${crypto.createHash('md5').update(cleanTitle + fullUrl).digest('hex').slice(0, 8)}`;
                    
                        if (!items.some(i => i.id === id)) {
                            items.push({
                                id,
                                municipality: '香芝市',
                                title: cleanTitle,
                                type: '建築',
                                announcementDate: detailAnnouncementDate || date,
                                biddingDate: undefined,
                                link: fullUrl,
                                status: isResult ? '落札' : '受付中',
                            });
                        }
                    }
                });
                await new Promise(r => setTimeout(r, 200));
            } catch (error) {
                console.warn('[香芝市Web] 詳細ページ取得失敗:', link.href, error instanceof Error ? error.message : String(error));
            }
        }
    } catch (e) {
        console.error('[香芝市Web] エラー:', e);
    }

    for (const item of items) {
        const known = KASHIBA_KNOWN_SCHEDULES[item.title];
        if (!known) continue;
        if (!item.biddingDate) item.biddingDate = known.biddingDate;
        if (!item.announcementDate || item.announcementDate.startsWith('2025-')) {
            item.announcementDate = known.announcementDate || item.announcementDate;
        }
        if (known.link) item.link = known.link;
    }

    for (const fallbackItem of buildKnownKashibaItems()) {
        if (!items.some(item => item.title === fallbackItem.title)) {
            items.push(fallbackItem);
        }
    }

    return items;
}

export class KashibaCityScraper implements Scraper {
    municipality: '香芝市' = '香芝市' as const;

    async scrape(): Promise<BiddingItem[]> {
        const webItems = await scrapeKashibaWebsite();
        let epiItems: BiddingItem[] = [];
        try {
            epiItems = await Promise.race([
                scrapeKashibaCity(),
                new Promise<BiddingItem[]>((_, reject) => {
                    setTimeout(() => reject(new Error('EPI timeout')), 90000);
                }),
            ]);
        } catch (error) {
            console.warn('[香芝市] EPI取得をスキップ:', error instanceof Error ? error.message : String(error));
        }
        console.log(`[香芝市] 合計: ${epiItems.length + webItems.length} 件 (EPI:${epiItems.length}, Web:${webItems.length})`);
        return [...epiItems, ...webItems];
    }
}

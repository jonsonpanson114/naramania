import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import type { Element } from 'domhandler';
import { chromium } from 'playwright';
import type { Frame, Page } from 'playwright';
import { BiddingItem, Scraper } from '../types/bidding';
import { extractTargetedResultsFromPDF } from '../services/gemini_service';
import { downloadPDFBuffer } from '../utils/pdf_utils';
import { shouldKeepItem } from './common/filter';

const EPI_URL = 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=062006E007200640';

// 令和8年度(2026年度)のみを対象にする。
// 過去年度(令和7=2025, 令和6=2024)まで EPI をページ送りすると数時間かかり、
// Promise.race のタイムアウトで「スキップ」した後も裏で延々と遡り続けるため、
// 当年度だけに限定する。
const NENDOS = ['2026'];
const KASHIBA_KNOWN_SCHEDULES: Record<string, {
    announcementDate?: string;
    biddingDate: string;
    link?: string;
    status?: '受付中' | '受付終了' | '落札';
    winningContractor?: string;
}> = {
    '志都美小学校改築工事に伴う実施設計業務': {
        announcementDate: '2026-06-18',
        biddingDate: '2026-07-10',
        link: 'https://www.city.kashiba.lg.jp/site/nyuusatsu/67641.html',
        status: '受付終了',
    },
    '五位堂小学校改築工事に伴う実施設計業務': {
        announcementDate: '2026-04-23',
        biddingDate: '2026-05-26',
        link: 'https://www.city.kashiba.lg.jp/site/nyuusatsu/list288-1034.html',
        status: '受付終了',
    },
    '下田小学校長寿命化改修工事': {
        announcementDate: '2026-04-23',
        biddingDate: '2026-05-21',
        link: 'https://www.city.kashiba.lg.jp/site/nyuusatsu/65857.html',
        status: '落札',
        winningContractor: '株式会社上村組',
    },
    '香芝北中学校トイレ改修工事（Ⅱ期）': {
        announcementDate: '2026-03-19',
        biddingDate: '2026-04-07',
        link: 'https://www.city.kashiba.lg.jp/uploaded/attachment/31283.pdf',
        status: '落札',
        winningContractor: '株式会社竹澤工業',
    },
    '旭ケ丘小学校トイレ改修工事（Ⅱ期）': {
        announcementDate: '2026-03-19',
        biddingDate: '2026-04-07',
        link: 'https://www.city.kashiba.lg.jp/uploaded/attachment/31280.pdf',
        status: '落札',
        winningContractor: '株式会社豊国',
    },
    '関屋小学校南館他改修工事': {
        announcementDate: '2026-03-12',
        biddingDate: '2026-04-07',
        link: 'https://www.city.kashiba.lg.jp/uploaded/attachment/31282.pdf',
        status: '落札',
        winningContractor: '株式会社上村組',
    },
    '三和小学校校舎増築工事に伴う設計業務': {
        announcementDate: '2026-04-09',
        biddingDate: '2026-04-28',
        link: 'https://www.city.kashiba.lg.jp/uploaded/attachment/31836.pdf',
    },
    '志都美小学校建替工事に伴う基本設計業務': {
        announcementDate: '2025-10-09',
        biddingDate: '2025-10-28',
        link: 'https://www.city.kashiba.lg.jp/soshiki/7/60631.html',
    },
    '五位堂小学校建替工事に伴う基本設計業務': {
        announcementDate: '2025-10-09',
        biddingDate: '2025-11-05',
        link: 'https://www.city.kashiba.lg.jp/soshiki/7/60631.html',
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
        status: schedule.status || '受付中',
        winningContractor: schedule.winningContractor,
    }));
}

async function enrichKnownKashibaResults(items: BiddingItem[]): Promise<void> {
    const unresolved = items.filter(item =>
        item.municipality === '香芝市'
        && /\.pdf(?:$|\?)/i.test(item.link)
        && KASHIBA_KNOWN_SCHEDULES[item.title]
        && (!item.winningContractor || item.status === '受付終了'),
    );
    if (unresolved.length === 0) return;

    const grouped = new Map<string, BiddingItem[]>();
    unresolved.forEach((item) => {
        const bucket = grouped.get(item.link) || [];
        bucket.push(item);
        grouped.set(item.link, bucket);
    });

    for (const [pdfUrl, pdfItems] of grouped.entries()) {
        const pdfBuffer = await downloadPDFBuffer(pdfUrl);
        if (!pdfBuffer) continue;

        const results = await extractTargetedResultsFromPDF(pdfBuffer, pdfItems.map(item => item.title));
        if (!results) continue;

        const resultMap = new Map(results.map(result => [result.title, result]));
        pdfItems.forEach((item) => {
            const resolved = resultMap.get(item.title);
            if (!resolved?.found) return;

            if (resolved.winningContractor) item.winningContractor = resolved.winningContractor;
            if (resolved.status === '落札' || resolved.status === '不調') {
                item.status = resolved.status;
            }
        });
    }
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

async function getKashibaDataFrame(page: Page, pattern: RegExp): Promise<Frame | null> {
    // 検索結果一覧の実データは frmRIGHT の中にネストされた name="right" の
    // iframe(KFC401FrameShow/KFK401FrameShow)にしかない。frmRIGHT自体のURLも
    // pattern(KK401SearchAction)にマッチしてしまい、page.frames()内ではその
    // frmRIGHT が name="right" のiframeより先に列挙されるため、従来は
    // find()が常にfrmRIGHT(検索フォームのみで結果データ0件)を返してしまい、
    // 結果が一件も取得できていなかった。name="right"を優先して探す。
    for (let i = 0; i < 20; i += 1) {
        const namedFrame = page.frames().find(candidate => candidate.name() === 'right');
        if (namedFrame) return namedFrame;
        const patternFrame = page.frames().find(candidate => pattern.test(candidate.url()));
        if (patternFrame) return patternFrame;
        await page.waitForTimeout(500);
    }
    return null;
}

async function openKashibaIssuePage(page: Page, categoryText: string): Promise<Frame | null> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        await page.goto(EPI_URL, { waitUntil: 'load', timeout: 30000 });
        await page.waitForTimeout(1500);

        const serviceText = ((await page.locator('body').textContent().catch(() => '')) || '').replace(/\s+/g, ' ');
        if (serviceText.includes('サービス停止中') && serviceText.includes('情報公開')) {
            console.warn('[香芝市] EPI 情報公開サービス停止中のため取得をスキップします。');
            return null;
        }

        const category = page.locator('span.ATYPE').filter({ hasText: categoryText }).first();
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

async function openKashibaMenu(page: Page, categoryText: string, menuText: string): Promise<Frame | null> {
    const rightFrame = await openKashibaIssuePage(page, categoryText);
    if (!rightFrame) return null;

    const menu = rightFrame.locator(`span.ATYPE:has-text("${menuText}")`).first();
    if (await menu.count() === 0) return null;
    await menu.click({ force: true, timeout: 30000 });
    await page.waitForTimeout(4000);

    return getRightFrame(page);
}

// 「工事」だけでなく「コンサル」業務区分も見る。設計業務・測量業務等はコンサル区分に
// しか出てこないため、工事だけ見ていると設計事務所の受注案件が丸ごと欠落する。
const EPI_CATEGORIES = ['工事', 'コンサル'];

async function scrapeKashibaCity(): Promise<BiddingItem[]> {
    const itemsMap = new Map<string, BiddingItem>();

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(120000);

    try {
        for (const categoryText of EPI_CATEGORIES) {
            const initialRightFrame = await openKashibaIssuePage(page, categoryText);
            if (!initialRightFrame) {
                console.warn(`[香芝市] 業務区分「${categoryText}」の初期画面取得に失敗`);
                continue;
            }

            // 3) 部局 = 「香芝市」全体（1792ZZZZZZ）を選択（もしあれば）
            // 以前の 179205ZZZZ より広い可能性がある
            const bukyokuSel = page.locator('select[name="bukyoku"]');
            if (await bukyokuSel.count() > 0) {
                await bukyokuSel.selectOption('1792ZZZZZZ').catch(() => bukyokuSel.selectOption({ index: 0 }));
                await page.waitForTimeout(1000);
            }

            for (const nendo of NENDOS) {
                console.log(`[香芝市] 業務区分「${categoryText}」年度 ${nendo} 検索中...`);
                const rightFrame = await openKashibaMenu(page, categoryText, '入札・契約結果情報');
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

                // 6) データiframe (KFK401FrameShow/KFC401FrameShow, name='right') からデータ取得
                let page_num = 1;
                while (true) {
                    const dataFrame = await getKashibaDataFrame(page, /KFK4|KFC4|KK401SearchAction/);
                    if (!dataFrame) {
                        console.warn('[香芝市] データフレームが見つかりません');
                        break;
                    }

                    const rows = await dataFrame.locator('table tr').all();

                    for (const row of rows) {
                        const cells = await row.locator('td').all();
                        if (cells.length < 7) continue;

                        // col: 0=結果種別, 1=公開日, 2=工事名/業務名, 3=契約管理番号, 4=入札方式, 5=落札者, 6=金額, 7=課所名
                        const pubDate = parseJpDate((await cells[1].textContent() || '').trim());
                        const title = (await cells[2].textContent() || '').trim().replace(/\s+/g, ' ');
                        const contractNo = (await cells[3].textContent() || '').trim().replace(/\s+/g, '');
                        const rawWinner = cells.length >= 6 ? (await cells[5].textContent() || '').trim().replace(/\s+/g, ' ') : '';
                        const winner = rawWinner === '-' ? '' : rawWinner;
                        // 金額セルには document.write() で金額を書き出すインラインscriptのソースが
                        // textContent に混ざって入ってくるため、末尾の「◯,◯◯◯円」だけを拾う。
                        // 落札者欄が"-"(空)の行はここに「取止め・不調」という文字列が入る。
                        const rawAmountText = cells.length >= 7 ? (await cells[6].textContent() || '').trim() : '';
                        const isCancelled = !winner && /取止め|不調/.test(rawAmountText);
                        const amountMatch = rawAmountText.match(/([\d,]+)\s*円\s*$/);
                        const parsedAmount = amountMatch ? parseInt(amountMatch[1].replace(/,/g, ''), 10) : Number.NaN;
                        const knownSchedule = KASHIBA_KNOWN_SCHEDULES[title];
                        const titleLink = row.locator('a').first();
                        const href = await titleLink.getAttribute('href').catch(() => null);
                        const controlNo = href?.match(/doEdit030\('([^']+)'\)/)?.[1];
                        const detailUrl = controlNo
                            ? `https://www.epi-cloud.fwd.ne.jp/koukai/do/KK402ShowAction?control_no=${controlNo}`
                            : knownSchedule?.link || EPI_URL;

                        if (!title || !pubDate) continue;
                        if (!shouldKeepItem(title)) continue;

                        const id = `kashiba-${contractNo || pubDate + '-' + title.slice(0, 10)}`;
                        itemsMap.set(id, {
                            id,
                            municipality: '香芝市',
                            title,
                            type: inferKashibaType(title),
                            announcementDate: knownSchedule?.announcementDate || pubDate,
                            biddingDate: knownSchedule?.biddingDate || pubDate,
                            link: detailUrl,
                            // knownSchedule.status は結果が出る前に手打ちした「受付終了」のままの
                            // ことがある。EPIの結果一覧行そのものに落札者が載っている場合は、
                            // 古い手打ちステータスより実際の落札の有無を優先する。
                            // 落札者欄が"-"で金額欄に「取止め・不調」と明記されている行を
                            // 単純に knownSchedule?.status || '落札' にフォールバックさせると
                            // 落札者不在のまま「落札」と誤表示していたため、不調を明示的に判定する。
                            status: winner ? '落札' : isCancelled ? '不調' : (knownSchedule?.status || '受付終了'),
                            winningContractor: isCancelled ? undefined : (winner || knownSchedule?.winningContractor),
                            estimatedPrice: Number.isFinite(parsedAmount) ? `${parsedAmount.toLocaleString()}円` : undefined,
                        });
                    }

                    // ページネーション: 「次へ」リンクは結果データとは別に、外側の
                    // frmRIGHT フレーム(検索件数サマリーと一緒に描画される)にしかない。
                    // データフレーム(name="right")側で探すと常に0件で、2ページ目以降が
                    // 一切読まれず古い案件(4月・5月開札分など)が丸ごと欠落していた。
                    const outerFrame = await getRightFrame(page);
                    const nextLink = outerFrame?.locator('a:has-text("次へ")').first();
                    if (!nextLink || await nextLink.count() === 0) break;

                    page_num++;
                    console.log(`[香芝市] ページ ${page_num} へ`);
                    await nextLink.click();
                    await page.waitForTimeout(4000);
                }

                // 検索画面に戻るために一旦初期画面へ
                await openKashibaIssuePage(page, categoryText);
            }
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
                                type: inferKashibaType(cleanTitle),
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
                                type: inferKashibaType(cleanTitle),
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
                // 工事・コンサルの2区分を順に見るようになったため、1区分あたり
                // ~50秒として余裕を持たせる(以前は工事1区分だけで90秒)。
                new Promise<BiddingItem[]>((_, reject) => {
                    setTimeout(() => reject(new Error('EPI timeout')), 180000);
                }),
            ]);
        } catch (error) {
            console.warn('[香芝市] EPI取得をスキップ:', error instanceof Error ? error.message : String(error));
        }

        await enrichKnownKashibaResults(webItems);
        await enrichKnownKashibaResults(epiItems);

        console.log(`[香芝市] 合計: ${epiItems.length + webItems.length} 件 (EPI:${epiItems.length}, Web:${webItems.length})`);
        return [...epiItems, ...webItems];
    }
}

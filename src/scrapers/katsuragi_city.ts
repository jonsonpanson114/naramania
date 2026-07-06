import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';
import type { Frame, Page } from 'playwright';
import crypto from 'crypto';
import { BiddingItem, BiddingType, Scraper } from '../types/bidding';
import { shouldKeepItem } from './common/filter';
import { parseJapaneseDateToIso } from './common/pdf_text';

const BASE = 'https://www.city.katsuragi.nara.jp';
const ANNOUNCE_URL = `${BASE}/soshiki/kanzaika/2/1637.html`;
const RESULT_URL = `${BASE}/soshiki/kanzaika/2/1657.html`;
const EPI_CLOUD_FORM = 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200720';
const EPI_BASE = 'https://www.epi-cloud.fwd.ne.jp';
const TARGET_NENDOS = ['2026', '2025'];
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; naramania-scraper/1.0)' };

function titleSeemsRelevant(title: string): boolean {
    return shouldKeepItem(title);
}

function classifyType(title: string, gyoshu = ''): BiddingType {
    const target = `${title} ${gyoshu}`;
    if (/(設計|測量|コンサル|監理|調査)/.test(target)) return 'コンサル';
    if (/(委託|業務|管理)/.test(target)) return '委託';
    return '建築';
}

function normalizeTitle(title: string): string {
    return title
        .normalize('NFKC')
        .replace(/\s+/g, '')
        .replace(/[・･]/g, '')
        .replace(/^(第[0-9]+号)?葛城市立/u, '$1')
        .trim();
}

function comparisonDate(item: BiddingItem): string {
    return item.biddingDate || item.announcementDate;
}

function daysBetween(dateA?: string, dateB?: string): number {
    if (!dateA || !dateB) return Number.POSITIVE_INFINITY;
    const a = new Date(dateA).getTime();
    const b = new Date(dateB).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
    return Math.abs(a - b) / (1000 * 60 * 60 * 24);
}

function makeId(prefix: string, title: string, extra = ''): string {
    return `${prefix}-${crypto.createHash('md5').update(`${title}|${extra}`).digest('hex').slice(0, 8)}`;
}

function parseJapaneseDate(text: string): string {
    const normalized = text.normalize('NFKC');
    const reiwa = normalized.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (reiwa) {
        const year = 2018 + parseInt(reiwa[1], 10);
        return `${year}-${reiwa[2].padStart(2, '0')}-${reiwa[3].padStart(2, '0')}`;
    }

    const western = normalized.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/);
    if (western) {
        return `${western[1]}-${western[2].padStart(2, '0')}-${western[3].padStart(2, '0')}`;
    }

    return '';
}

function parseBidOpeningDate(text: string): string | undefined {
    const normalized = text.normalize('NFKC').replace(/\s+/g, ' ');
    const match = normalized.match(/第\s*4\s*開札の日時及び場所[\s\S]*?令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (!match) return undefined;

    const year = 2018 + parseInt(match[1], 10);
    return `${year}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function toAbsoluteUrl(href: string): string {
    if (!href) return EPI_CLOUD_FORM;
    if (href.startsWith('javascript:')) return EPI_CLOUD_FORM;
    if (/^https?:\/\//i.test(href)) return href;
    if (href.startsWith('//')) return `https:${href}`;
    if (href.startsWith('/')) return `${BASE}${href}`;
    return `${EPI_BASE}${href}`;
}

async function extractBiddingDateFromPdf(pdfUrl?: string): Promise<string | undefined> {
    if (!pdfUrl) return undefined;

    try {
        const res = await axios.get<ArrayBuffer>(pdfUrl, {
            responseType: 'arraybuffer',
            headers: HEADERS,
            timeout: 20000,
        });
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const data = new Uint8Array(res.data as ArrayBuffer);
        const doc = await pdfjsLib.getDocument({ data, verbosity: 0, isEvalSupported: false }).promise;

        let text = '';
        for (let i = 1; i <= Math.min(doc.numPages, 3); i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(item => ('str' in item ? item.str : '')).join(' ');
            text += '\n';
        }

        return parseBidOpeningDate(text);
    } catch (error) {
        console.error(`[葛城市] PDF解析失敗: ${pdfUrl}`, error instanceof Error ? error.message : String(error));
        return undefined;
    }
}

type KatsuragiResultInfo = {
    title: string;
    biddingDate?: string;
    status: BiddingItem['status'];
    winningContractor?: string;
};

type ResultBidAndWinner = {
    biddingDate?: string;
    winningContractor?: string;
};

function extractResultBlocks(text: string): string[] {
    const blocks = text.match(/様式第[13１３]号[\s\S]*?(?=様式第[13１３]号|$)/g);
    return blocks || [];
}

function cleanResultValue(value?: string): string | undefined {
    if (!value) return undefined;
    const cleaned = value.replace(/\s+/g, ' ').trim();
    if (/^[-‐－ー―]+$/.test(cleaned)) return undefined;
    return cleaned || undefined;
}

function extractResultTitle(block: string): string | undefined {
    const match = block.match(
        /(?:一般|指名)競争入札結果公表書\s+(.+?)\s+(?:[^\s]+課|[^\s]+室|[^\s]+局|[^\s]+事務所|教育委員会)(?=\s+(?:奈良県|入札参加業者|指名業者))/u,
    );
    return cleanResultValue(match?.[1]);
}

function extractResultBidAndWinner(block: string): ResultBidAndWinner {
    const normalized = block.normalize('NFKC').replace(/\s+/g, ' ');
    const beforeAmount = normalized.split(/6\.\s*落札金額/u)[0] || normalized;
    const dateRegex = /令和\s*\d+\s*年\s*\d+\s*月\s*\d+\s*日(?:\s*[（(][^)）]+[)）])?/gu;
    const matches = Array.from(beforeAmount.matchAll(dateRegex));
    const lastDateMatch = matches.at(-1);

    if (!lastDateMatch || lastDateMatch.index === undefined) {
        return {};
    }

    const biddingDate = parseJapaneseDate(lastDateMatch[0]) || undefined;
    const winnerRaw = beforeAmount.slice(lastDateMatch.index + lastDateMatch[0].length);
    const winningContractor = cleanResultValue(
        winnerRaw
            .replace(/^[-:：、。\s]+/u, '')
            .replace(/\(住所\).*$/u, '')
            .replace(/^\d+\.\s*/u, ''),
    );

    return {
        biddingDate,
        winningContractor: winningContractor || undefined,
    };
}

function extractResultStatus(block: string): BiddingItem['status'] {
    if (/不調|取止め|中止/u.test(block)) return '不調';
    return '落札';
}

async function extractResultInfosFromPdf(pdfUrl: string): Promise<KatsuragiResultInfo[]> {
    try {
        const res = await axios.get<ArrayBuffer>(pdfUrl, {
            responseType: 'arraybuffer',
            headers: HEADERS,
            timeout: 20000,
        });
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const data = new Uint8Array(res.data as ArrayBuffer);
        const doc = await pdfjsLib.getDocument({ data, verbosity: 0, isEvalSupported: false }).promise;

        let text = '';
        for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(item => ('str' in item ? item.str : '')).join(' ');
            text += '\n';
        }

        return extractResultBlocks(text)
            .map((block): KatsuragiResultInfo | null => {
                const title = extractResultTitle(block);
                if (!title || !titleSeemsRelevant(title)) return null;
                const { biddingDate, winningContractor } = extractResultBidAndWinner(block);
                return {
                    title,
                    biddingDate,
                    status: extractResultStatus(block),
                    winningContractor,
                };
            })
            .filter((item): item is KatsuragiResultInfo => Boolean(item));
    } catch (error) {
        console.error(`[葛城市] 結果PDF解析失敗: ${pdfUrl}`, error instanceof Error ? error.message : String(error));
        return [];
    }
}

async function scrapeWebsiteResults(): Promise<Map<string, KatsuragiResultInfo>> {
    const resultMap = new Map<string, KatsuragiResultInfo>();
    const res = await axios.get(RESULT_URL, { timeout: 20000, headers: HEADERS });
    const $ = cheerio.load(res.data);

    const pdfLinks = $('a')
        .toArray()
        .map(anchor => ({
            href: toAbsoluteUrl($(anchor).attr('href') || ''),
            text: $(anchor).text().replace(/\s+/g, ' ').trim(),
        }))
        .filter(link =>
            /\.pdf(?:\?|$)/i.test(link.href)
            && /入札分/.test(link.text)
            && /令和[78]年|R[78]/.test(link.text),
        );

    for (const link of pdfLinks) {
        const infos = await extractResultInfosFromPdf(link.href);
        infos.forEach((info) => {
            resultMap.set(`${normalizeTitle(info.title)}|${info.biddingDate || ''}`, info);
        });
    }

    return resultMap;
}

async function getRightFrame(page: Page): Promise<Frame | null> {
    for (let i = 0; i < 20; i += 1) {
        const frame = page.frames().find(candidate => candidate.name() === 'frmRIGHT');
        if (frame) return frame;
        await page.waitForTimeout(500);
    }
    return null;
}

async function clickRightMenu(page: Page, label: string): Promise<Frame | null> {
    const rightFrame = await getRightFrame(page);
    if (!rightFrame) return null;

    const menu = rightFrame.locator('span.ATYPE').filter({ hasText: label }).first();
    if (await menu.count() === 0) return null;

    await menu.click({ force: true, timeout: 30000 });
    await page.waitForTimeout(2500);
    return getRightFrame(page);
}

async function getDataFrame(page: Page): Promise<Frame | null> {
    for (let i = 0; i < 20; i += 1) {
        const frame = page.frames().find(candidate =>
            candidate.name() === 'right' || /KF[CK]301FrameShow/.test(candidate.url()),
        );
        if (frame) return frame;
        await page.waitForTimeout(500);
    }
    return null;
}

async function submitIssueSearch(frame: Frame, nendo: string) {
    await frame.waitForSelector('form[name="KK301DynaActionForm"]', { timeout: 30000 });
    await frame.selectOption('select[name="nendo"]', nendo);
    const perPage = frame.locator('select[name="perPage"], select[name="A300"]');
    if (await perPage.count() > 0) {
        await perPage.first().selectOption('100').catch(() => undefined);
    }
    await frame.locator('input[type="button"][value="検索"]').first().click({ force: true, timeout: 30000 });
}

async function submitResultSearch(frame: Frame, nendo: string) {
    await frame.waitForSelector('form[name="KK401DynaActionForm"]', { timeout: 30000 });
    await frame.selectOption('select[name="nendo"]', nendo);
    const perPage = frame.locator('select[name="perPage"], select[name="A300"]');
    if (await perPage.count() > 0) {
        await perPage.first().selectOption('100').catch(() => undefined);
    }
    await frame.locator('input[type="button"][value="検索"]').first().click({ force: true, timeout: 30000 });
}

async function extractIssueResults(frame: Frame): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];
    const rows = await frame.locator('table tr').all().catch(() => []);

    for (const row of rows) {
        const link = row.locator('a').first();
        if (await link.count() === 0) continue;

        const title = ((await link.textContent()) || '').replace(/\s+/g, ' ').trim();
        if (!title || !titleSeemsRelevant(title)) continue;

        const cells = await row.locator('td').all();
        const cellTexts = await Promise.all(
            cells.map(async (cell) => ((await cell.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()),
        );
        const rowText = cellTexts.join(' ');
        const dates = Array.from(new Set(rowText.match(/\d{4}\/\d{1,2}\/\d{1,2}/g) || []))
            .map(text => parseJapaneseDate(text))
            .filter(Boolean);
        const gyoshu = cellTexts.find(text => /(建築|電気|管|機械|防水|解体|設計|測量|コンサル|監理|調査)/.test(text)) || '';
        const href = await link.getAttribute('href');
        const announcementDate = dates[0] || '';
        const biddingDate = dates[1] || undefined;
        if (!announcementDate) continue;

        items.push({
            id: makeId('katsuragi-epi', title, href || announcementDate),
            municipality: '葛城市',
            title,
            type: classifyType(title, gyoshu),
            announcementDate,
            biddingDate,
            link: toAbsoluteUrl(href || ''),
            status: '受付中',
        });
    }

    return items;
}

async function extractResultResults(frame: Frame): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];
    const rows = await frame.locator('table tr').all().catch(() => []);

    for (const row of rows) {
        const cells = await row.locator('td').all();
        if (cells.length < 7) continue;

        const title = ((await cells[2].innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        if (!title || !titleSeemsRelevant(title)) continue;

        const biddingDate = parseJapaneseDate(((await cells[1].innerText().catch(() => '')) || '').trim()) || undefined;
        const controlNo = ((await cells[3].innerText().catch(() => '')) || '').replace(/\s+/g, '').trim();
        const winnerRaw = ((await cells[5].innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        const amountText = ((await cells[6].innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        const href = await row.locator('a').first().getAttribute('href').catch(() => null);
        const isFailed = /取止め|不調|中止/.test(amountText);

        items.push({
            id: controlNo ? `katsuragi-result-${controlNo}` : makeId('katsuragi-result', title, href || biddingDate || ''),
            municipality: '葛城市',
            title,
            type: classifyType(title),
            announcementDate: biddingDate || '',
            biddingDate,
            link: toAbsoluteUrl(href || ''),
            status: isFailed ? '不調' : '落札',
            winningContractor: isFailed || !winnerRaw || winnerRaw === '-' ? undefined : winnerRaw,
        });
    }

    return items;
}

async function scrapeEpi(page: Page): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];
    await page.goto(EPI_CLOUD_FORM, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    for (const categoryLabel of ['工事', 'コンサル']) {
        await page.goto(EPI_CLOUD_FORM, { waitUntil: 'load' });
        await page.waitForTimeout(2000);
        await page.locator('span.ATYPE').filter({ hasText: categoryLabel }).first().click({ force: true, timeout: 30000 });
        await page.waitForTimeout(3000);

        const issueFrame = await clickRightMenu(page, '発注情報の検索');
        if (issueFrame) {
            for (const nendo of TARGET_NENDOS) {
                const optionCount = await issueFrame.locator(`select[name="nendo"] option[value="${nendo}"]`).count();
                if (optionCount === 0) continue;

                await submitIssueSearch(issueFrame, nendo);
                await page.waitForTimeout(2500);
                let dataFrame = await getDataFrame(page);
                while (dataFrame) {
                    items.push(...await extractIssueResults(dataFrame));
                    const nextLink = dataFrame.locator('a').filter({ hasText: '次へ' }).first();
                    if (await nextLink.count() === 0) break;
                    await nextLink.click({ force: true, timeout: 10000 }).catch(() => undefined);
                    await page.waitForTimeout(1500);
                    dataFrame = await getDataFrame(page);
                }
            }
        }

        await page.goto(EPI_CLOUD_FORM, { waitUntil: 'load' });
        await page.waitForTimeout(2000);
        await page.locator('span.ATYPE').filter({ hasText: categoryLabel }).first().click({ force: true, timeout: 30000 });
        await page.waitForTimeout(3000);

        const resultFrame = await clickRightMenu(page, '入札・契約結果情報');
        if (!resultFrame) continue;

        for (const nendo of TARGET_NENDOS) {
            const optionCount = await resultFrame.locator(`select[name="nendo"] option[value="${nendo}"]`).count();
            if (optionCount === 0) continue;

            await submitResultSearch(resultFrame, nendo);
            await page.waitForTimeout(2500);
            let dataFrame = await getDataFrame(page);
            while (dataFrame) {
                items.push(...await extractResultResults(dataFrame));
                const nextLink = dataFrame.locator('a').filter({ hasText: '次へ' }).first();
                if (await nextLink.count() === 0) break;
                await nextLink.click({ force: true, timeout: 10000 }).catch(() => undefined);
                await page.waitForTimeout(1500);
                dataFrame = await getDataFrame(page);
            }
        }
    }

    return items;
}

async function scrapeWebsiteAnnouncements(): Promise<BiddingItem[]> {
    const allItems: BiddingItem[] = [];
    const res = await axios.get(ANNOUNCE_URL, { timeout: 20000, headers: HEADERS });
    const $ = cheerio.load(res.data);

    $('table tr').each((_, row) => {
        const cells = $(row).find('td');
        if (cells.length < 4) return;

        const numText = cells.eq(0).text().trim();
        if (!/^\d+$/.test(numText)) return;

        const titleEl = cells.eq(1);
        const title = (titleEl.find('a').first().text().trim() || titleEl.text().trim())
            .replace(/\(PDFファイル:[^)]*\)/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (!title || !titleSeemsRelevant(title)) return;

        const pdfHref = titleEl.find('a').attr('href') || '';
        const dept = cells.eq(2).text().trim();
        const dateText = cells.eq(3).text().trim();
        const rowText = $(row).text().replace(/\s+/g, ' ').trim();
        const pdfUrl = pdfHref
            ? (pdfHref.startsWith('//') ? `https:${pdfHref}` : pdfHref.startsWith('/') ? `${BASE}${pdfHref}` : `${BASE}/${pdfHref.replace(/^\.\//, '')}`)
            : undefined;

        allItems.push({
            id: makeId('katsuragi-web', title, pdfUrl || dateText),
            municipality: '葛城市',
            title,
            type: classifyType(`${title} ${dept}`),
            announcementDate: parseJapaneseDate(dateText) || parseJapaneseDateToIso(dateText) || new Date().toISOString().split('T')[0],
            link: pdfUrl || ANNOUNCE_URL,
            pdfUrl,
            status: /中止|不調/.test(rowText) ? '不調' : (/終了しました/.test(rowText) ? '受付終了' : '受付中'),
        });
    });

    const CONCURRENCY = 3;
    for (let i = 0; i < allItems.length; i += CONCURRENCY) {
        const batch = allItems.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async item => {
            item.biddingDate = await extractBiddingDateFromPdf(item.pdfUrl);
        }));
    }

    return allItems;
}

export class KatsuragiCityScraper implements Scraper {
    municipality: '葛城市' = '葛城市' as const;

    async scrape(): Promise<BiddingItem[]> {
        console.log('[葛城市] 入札公告 取得中...');

        const browser = await chromium.launch({ headless: true });
        const items = new Map<string, BiddingItem>();

        const upsert = (item: BiddingItem) => {
            const normalizedTitle = normalizeTitle(item.title);
            const itemDate = comparisonDate(item);
            const existingEntry = Array.from(items.entries()).find(([, candidate]) =>
                normalizeTitle(candidate.title) === normalizedTitle
                && daysBetween(comparisonDate(candidate), itemDate) <= 14,
            );
            const existing = existingEntry?.[1];
            if (!existing) {
                items.set(`${normalizedTitle}|${itemDate}`, item);
                return;
            }

            if (item.announcementDate && (!existing.announcementDate || item.announcementDate < existing.announcementDate)) {
                existing.announcementDate = item.announcementDate;
            }
            if (item.biddingDate && !existing.biddingDate) existing.biddingDate = item.biddingDate;
            if (item.link && (!existing.link || existing.link === ANNOUNCE_URL)) existing.link = item.link;
            if (item.pdfUrl && !existing.pdfUrl) existing.pdfUrl = item.pdfUrl;
            if (item.winningContractor && !existing.winningContractor) existing.winningContractor = item.winningContractor;
            if (item.status === '落札' || item.status === '不調') {
                existing.status = item.status;
            } else if (item.status === '受付終了' && existing.status === '受付中') {
                existing.status = '受付終了';
            }
        };

        const applyWebsiteResultInfo = (item: BiddingItem, websiteResults: Map<string, KatsuragiResultInfo>) => {
            const resultInfo = websiteResults.get(`${normalizeTitle(item.title)}|${item.biddingDate || ''}`);
            if (!resultInfo) return;

            item.status = resultInfo.status;
            if (resultInfo.winningContractor) item.winningContractor = resultInfo.winningContractor;
        };

        try {
            const webItems = await scrapeWebsiteAnnouncements();
            const websiteResults = await scrapeWebsiteResults();
            webItems.forEach((item) => {
                applyWebsiteResultInfo(item, websiteResults);
                upsert(item);
            });

            const page = await browser.newPage();
            page.setDefaultTimeout(120000);
            const epiItems = await scrapeEpi(page);
            epiItems.forEach((item) => {
                applyWebsiteResultInfo(item, websiteResults);
                upsert(item);
            });
        } catch (error) {
            console.error('[葛城市] スクレイパーエラー:', error instanceof Error ? error.message : String(error));
        } finally {
            await browser.close();
        }

        const allItems = Array.from(items.values())
            .sort((a, b) => b.announcementDate.localeCompare(a.announcementDate));
        console.log(`[葛城市] 合計 ${allItems.length} 件`);
        return allItems;
    }
}

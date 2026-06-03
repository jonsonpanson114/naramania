import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { chromium } from 'playwright';
import type { Frame, Page } from 'playwright';
import { BiddingItem, BiddingStatus, BiddingType, Scraper } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

const BASE_URL = 'https://www.city.gojo.lg.jp';
const GOJO_EPI_URL = 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=06200640072006C0';
const RESULT_JSON_URLS = [
    `${BASE_URL}/jigyousha/nyuusatsu/8/R8/index.tree.json`,
    `${BASE_URL}/jigyousha/nyuusatsu/8/R7/index.tree.json`,
];
const EDUCATION_LIST_URL = `${BASE_URL}/soshiki/kyouiku/1_2/index.html`;
const GOJO_EPI_NENDOS = ['2026', '2025', '2024'];
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; naramania-scraper/1.0)' };
const GOJO_RESULT_OVERRIDES: Record<string, Partial<Pick<BiddingItem, 'biddingDate' | 'status' | 'winningContractor'>>> = {
    'https://www.city.gojo.lg.jp/material/files/group/40/kkr8boukataisyobutu.pdf': {
        biddingDate: '2026-04-15',
        status: '不調',
    },
};

const ARCHITECTURE_CONTEXT = [
    '建築', '建築設備', '公民館', '施設', '庁舎', '学校', '校舎', '住宅',
    '団地', '消防', '空調', '防火設備', '特定建築物',
];

const ARCHITECTURE_WORK = [
    '工事', '改修', '修繕', '新築', '解体', '設計', '監理', '業務委託',
    '委託', '定期調査', '定期検査', '更新',
];

const EXCLUDE = [
    '印刷', '配付', '広告', '購入', 'おむつ', 'システム', '物品', '車両',
    '電気工作物保安管理', '開票', '投票', '広報', '紙',
    'PR動画', '草刈', '浄化槽', 'ネットワーク', '警備',
];

interface CmsPage {
    page_name: string;
    url: string;
    publish_datetime: string;
}

function shouldKeepGojoTitle(title: string): boolean {
    if (EXCLUDE.some(keyword => title.includes(keyword))) return false;
    return shouldKeepItem(title) || (
        ARCHITECTURE_CONTEXT.some(keyword => title.includes(keyword))
        && ARCHITECTURE_WORK.some(keyword => title.includes(keyword))
    );
}

function classifyType(title: string): BiddingType {
    if (title.includes('設計') || title.includes('監理')) return 'コンサル';
    if (title.includes('委託') || title.includes('業務')) return '委託';
    return '建築';
}

function makeId(title: string, suffix = ''): string {
    return `gojo-${crypto.createHash('md5').update(title + suffix).digest('hex').slice(0, 8)}`;
}

function normalizeGojoTitle(title: string): string {
    return title
        .replace(/^【入札(?:結果|公告)】\s*/, '')
        .replace(/（令和\s*\d+\s*年\s*\d+\s*月\s*\d+\s*日開札）$/, '')
        .trim();
}

function parseJapaneseDate(text: string): string {
    const reiwa = text.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (reiwa) {
        const year = 2018 + Number(reiwa[1]);
        return `${year}-${String(Number(reiwa[2])).padStart(2, '0')}-${String(Number(reiwa[3])).padStart(2, '0')}`;
    }
    return '';
}

function parseSlashDate(text: string): string {
    const match = text.trim().match(/(\d{4})\/(\d{2})\/(\d{2})/);
    if (!match) return '';
    return `${match[1]}-${match[2]}-${match[3]}`;
}

function normalizeGojoWinner(raw: string): string {
    return raw
        .replace(/\s+/g, ' ')
        .replace(/\s+(代表取締役|代表社員|代表|所長|支店長|営業所長).*$/, '')
        .trim();
}

function gojoItemKey(title: string, biddingDate?: string, link?: string): string {
    if (biddingDate) {
        return `${title}::${biddingDate}`;
    }

    return `${title}::${link || ''}`;
}

async function scrapeDetailPage(url: string): Promise<{ biddingDate?: string; pdfUrl?: string }> {
    try {
        const res = await axios.get(url, { timeout: 15000, headers: HEADERS });
        const $ = cheerio.load(res.data);
        const bodyText = $('body').text().replace(/\s+/g, ' ');
        const biddingDate = parseJapaneseDate(bodyText.match(/令和\s*\d+\s*年\s*\d+\s*月\s*\d+\s*日開札/) ? bodyText : '');
        const pdfHref = $('a[href*=".pdf"]').first().attr('href') || '';
        const pdfUrl = pdfHref
            ? (pdfHref.startsWith('http') ? pdfHref : new URL(pdfHref, url).toString())
            : undefined;
        return { biddingDate: biddingDate || undefined, pdfUrl };
    } catch {
        return {};
    }
}

async function getRightFrame(page: Page): Promise<Frame | null> {
    for (let i = 0; i < 20; i += 1) {
        const frame = page.frames().find(candidate => candidate.name() === 'frmRIGHT');
        if (frame) return frame;
        await page.waitForTimeout(500);
    }
    return null;
}

async function getDataFrame(page: Page): Promise<Frame | null> {
    for (let i = 0; i < 20; i += 1) {
        const frame = page.frames().find(candidate => candidate.name() === 'right' || candidate.url().includes('KFK401FrameShow'));
        if (frame) return frame;
        await page.waitForTimeout(500);
    }
    return null;
}

async function openGojoEpiResults(page: Page): Promise<Frame | null> {
    await page.goto(GOJO_EPI_URL, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1500);

    const category = page.locator('span.ATYPE').filter({ hasText: '工事' }).first();
    if (await category.count() === 0) return null;
    await category.click({ force: true, timeout: 30000 });
    await page.waitForTimeout(2500);

    const rightFrame = await getRightFrame(page);
    if (!rightFrame) return null;

    const resultMenu = rightFrame.locator('span.ATYPE').filter({ hasText: '入札・契約結果情報' }).first();
    if (await resultMenu.count() === 0) return null;
    await resultMenu.click({ force: true, timeout: 30000 });
    await page.waitForTimeout(2500);

    return getRightFrame(page);
}

async function openGojoEpiIssueInfo(page: Page): Promise<Frame | null> {
    await page.goto(GOJO_EPI_URL, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1500);

    const category = page.locator('span.ATYPE').filter({ hasText: '工事' }).first();
    if (await category.count() === 0) return null;
    await category.click({ force: true, timeout: 30000 });
    await page.waitForTimeout(2500);

    const rightFrame = await getRightFrame(page);
    if (!rightFrame) return null;

    const issueMenu = rightFrame.locator('span.ATYPE').filter({ hasText: '発注情報' }).first();
    if (await issueMenu.count() === 0) return null;
    await issueMenu.click({ force: true, timeout: 30000 });
    await page.waitForTimeout(2500);

    return getRightFrame(page);
}

function parseGojoEpiAmount(text: string, label: string): string | undefined {
    const pattern = new RegExp(`${label}[\\s\\S]*?(\\d{1,3}(?:,\\d{3})*)円`);
    const match = text.match(pattern);
    return match ? `${match[1]}円` : undefined;
}

async function scrapeGojoEpiIssueDates(page: Page): Promise<Map<string, { announcementDate?: string; biddingDate?: string }>> {
    const issueDates = new Map<string, { announcementDate?: string; biddingDate?: string }>();

    for (const nendo of GOJO_EPI_NENDOS) {
        let rightFrame = await openGojoEpiIssueInfo(page);
        if (!rightFrame) continue;

        await rightFrame.selectOption('select[name="nendo"]', nendo).catch(() => undefined);
        await rightFrame.selectOption('select[name="A300"]', '100').catch(() => undefined);
        await rightFrame.locator('input[type=button][value="検索"]').first().click({ timeout: 30000 });
        await page.waitForTimeout(4000);

        while (true) {
            rightFrame = await getRightFrame(page);
            const dataFrame = page.frames().find(candidate => candidate.name() === 'right' || candidate.url().includes('KFK301FrameShow'));
            if (!rightFrame || !dataFrame) break;

            const rows = await dataFrame.locator('table tr').all();
            for (const row of rows) {
                const cells = await row.locator('td').all();
                if (cells.length < 7) continue;

                const contractNo = (await cells[2].textContent() || '').replace(/\s+/g, '').trim();
                if (!contractNo) continue;

                const announcementDate = parseSlashDate((await cells[0].textContent() || '').trim()) || undefined;
                const biddingDate = parseSlashDate((await cells[6].textContent() || '').trim()) || undefined;
                issueDates.set(contractNo, { announcementDate, biddingDate });
            }

            const nextLink = rightFrame.locator('a').filter({ hasText: '次へ>>' }).first();
            if (await nextLink.count() === 0) break;
            await nextLink.click({ timeout: 30000 });
            await page.waitForTimeout(3000);
        }
    }

    return issueDates;
}

function deriveGojoEpiStatus(detailText: string, fallback: BiddingStatus): BiddingStatus {
    if (/取止め・不調|入札者がいないため、中止します|入札者がいないため中止します|不調|不成立|中止します/.test(detailText)) {
        return '不調';
    }
    if (/落札候補者の事後審査中/.test(detailText)) {
        return '受付終了';
    }
    return fallback;
}

async function scrapeGojoEpiDetail(page: Page, detailUrl: string): Promise<{
    status?: BiddingStatus;
    estimatedPrice?: string;
}> {
    const detailPage = await page.context().newPage();

    try {
        await detailPage.goto(detailUrl, { waitUntil: 'load', timeout: 30000 });
        await detailPage.waitForTimeout(1500);

        const bodyText = ((await detailPage.locator('body').textContent().catch(() => '')) || '')
            .replace(/\s+/g, ' ')
            .trim();

        return {
            status: deriveGojoEpiStatus(bodyText, '落札'),
            estimatedPrice: parseGojoEpiAmount(bodyText, '予定価格'),
        };
    } catch {
        return {};
    } finally {
        await detailPage.close().catch(() => undefined);
    }
}

async function extractGojoPdfResultDetails(pdfUrl: string): Promise<{
    biddingDate?: string;
    winningContractor?: string;
    status?: BiddingStatus;
}> {
    try {
        const res = await axios.get<ArrayBuffer>(pdfUrl, {
            responseType: 'arraybuffer',
            headers: HEADERS,
            timeout: 15000,
        });
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const doc = await pdfjsLib.getDocument({
            data: new Uint8Array(res.data as ArrayBuffer),
            verbosity: 0,
            isEvalSupported: false,
        }).promise;

        let text = '';
        for (let i = 1; i <= doc.numPages; i += 1) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(item => ('str' in item ? item.str : '')).join(' ');
        }

        const biddingDate = parseJapaneseDate(text) || undefined;
        const isFailed = /落\s*札\s*の\s*有\s*無[\s\S]{0,20}無|不調|不成立|取止め/.test(text);
        if (isFailed) {
            return { biddingDate, status: '不調' };
        }

        const winnerField = text.match(/7\s+8\s+(.+?)\s+9\s+/)?.[1];
        const winner = winnerField ? normalizeGojoWinner(winnerField) : undefined;

        return {
            biddingDate,
            winningContractor: winner || undefined,
            status: '落札',
        };
    } catch {
        return {};
    }
}

async function scrapeGojoEpiResults(): Promise<BiddingItem[]> {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const items = new Map<string, BiddingItem>();

    try {
        const issueDates = await scrapeGojoEpiIssueDates(page);

        for (const nendo of GOJO_EPI_NENDOS) {
            let rightFrame = await openGojoEpiResults(page);
            if (!rightFrame) continue;

            await rightFrame.selectOption('select[name="nendo"]', nendo).catch(() => undefined);
            await rightFrame.selectOption('select[name="A300"]', '100').catch(() => undefined);
            await rightFrame.locator('input[type=button][value="検索"]').first().click({ timeout: 30000 });
            await page.waitForTimeout(4000);

            while (true) {
                rightFrame = await getRightFrame(page);
                const dataFrame = await getDataFrame(page);
                if (!rightFrame || !dataFrame) break;

                const rows = await dataFrame.locator('table tr').all();
                for (const row of rows) {
                    const cells = await row.locator('td').all();
                    if (cells.length < 8) continue;

                    const rawTitle = (await cells[2].textContent() || '').replace(/\s+/g, ' ').trim();
                    if (!rawTitle || !shouldKeepGojoTitle(rawTitle)) continue;

                    const normalizedTitle = normalizeGojoTitle(rawTitle);
                    const biddingDate = parseSlashDate((await cells[1].textContent() || '').trim()) || undefined;
                    const contractNo = (await cells[3].textContent() || '').replace(/\s+/g, '').trim();
                    const rawWinner = (await cells[5].textContent() || '').replace(/\s+/g, ' ').trim();
                    const winner = rawWinner && rawWinner !== '-' ? rawWinner : undefined;
                    const amountText = (await cells[6].textContent() || '').replace(/\s+/g, ' ').trim();
                    const amountMatch = amountText.match(/([\d,]+)円/);
                    const amount = amountMatch ? `${amountMatch[1]}円` : undefined;
                    const titleLink = row.locator('a').first();
                    const href = await titleLink.getAttribute('href').catch(() => null);
                    const controlNo = href?.match(/doEdit030\('([^']+)'\)/)?.[1];
                    const detailUrl = controlNo
                        ? `https://www.epi-cloud.fwd.ne.jp/koukai/do/KK402ShowAction?control_no=${controlNo}`
                        : GOJO_EPI_URL;
                    const detail = (!winner || !amount)
                        ? await scrapeGojoEpiDetail(page, detailUrl)
                        : {};
                    const issueMeta = contractNo ? issueDates.get(contractNo) : undefined;

                    const item: BiddingItem = {
                        id: contractNo ? `gojo-epi-${contractNo}` : makeId(normalizedTitle, detailUrl),
                        municipality: '五條市',
                        title: normalizedTitle,
                        type: classifyType(normalizedTitle),
                        announcementDate: issueMeta?.announcementDate || biddingDate || '2026-01-01',
                        biddingDate: issueMeta?.biddingDate || biddingDate,
                        link: detailUrl,
                        status: detail.status || '落札',
                        winningContractor: winner,
                        estimatedPrice: amount || detail.estimatedPrice,
                    };
                    const key = gojoItemKey(normalizedTitle, biddingDate, contractNo || detailUrl);
                    items.set(key, mergeGojoItem(items.get(key), item));
                }

                const nextLink = rightFrame.locator('a').filter({ hasText: '次へ>>' }).first();
                if (await nextLink.count() === 0) break;
                await nextLink.click({ timeout: 30000 });
                await page.waitForTimeout(3000);
            }
        }
    } catch (e: unknown) {
        console.error('[五條市] EPI取得エラー:', e instanceof Error ? e.message : String(e));
    } finally {
        await context.close().catch(() => undefined);
        await browser.close();
    }

    return Array.from(items.values());
}

async function scrapeEducationPages(): Promise<BiddingItem[]> {
    try {
        const res = await axios.get(EDUCATION_LIST_URL, { timeout: 15000, headers: HEADERS });
        const $ = cheerio.load(res.data);
        const items: BiddingItem[] = [];

        for (const anchor of $('li.page a').toArray()) {
            const title = $(anchor).text().trim();
            if (!title.startsWith('【入札')) continue;
            if (!shouldKeepGojoTitle(title)) continue;

            const href = $(anchor).attr('href');
            if (!href) continue;

            const pageUrl = href.startsWith('http') ? href : new URL(href, BASE_URL).toString();
            const detail = await scrapeDetailPage(pageUrl);
            const announcementDate = parseJapaneseDate(title) || '';
            const status = title.includes('入札結果') ? '落札' : '受付中';
            const normalizedTitle = normalizeGojoTitle(title);

            items.push({
                id: makeId(normalizedTitle, pageUrl),
                municipality: '五條市',
                title: normalizedTitle,
                type: classifyType(title),
                announcementDate,
                biddingDate: detail.biddingDate,
                link: pageUrl,
                pdfUrl: detail.pdfUrl,
                status,
            });
        }

        return items;
    } catch (e: unknown) {
        console.error('[五條市] 教育委員会ページ取得エラー:', e instanceof Error ? e.message : String(e));
        return [];
    }
}

function mergeGojoItem(existing: BiddingItem | undefined, incoming: BiddingItem): BiddingItem {
    if (!existing) return incoming;

    return {
        ...existing,
        ...incoming,
        announcementDate: existing.announcementDate > incoming.announcementDate
            ? existing.announcementDate
            : incoming.announcementDate,
        biddingDate: incoming.biddingDate || existing.biddingDate,
        pdfUrl: incoming.pdfUrl || existing.pdfUrl,
        link: incoming.pdfUrl ? incoming.link : existing.link,
    };
}

export class GojoCityScraper implements Scraper {
    municipality: '五條市' = '五條市' as const;

    async scrape(): Promise<BiddingItem[]> {
        const items = new Map<string, BiddingItem>();

        for (const item of await scrapeGojoEpiResults()) {
            const key = gojoItemKey(item.title, item.biddingDate, item.link);
            items.set(key, mergeGojoItem(items.get(key), item));
        }

        for (const feedUrl of RESULT_JSON_URLS) {
            try {
                const res = await axios.get<CmsPage[]>(feedUrl, { timeout: 15000, headers: HEADERS });
                const pages = res.data.filter(page => shouldKeepGojoTitle(page.page_name));
                console.log(`[五條市] ${feedUrl}: ${pages.length}件対象`);

                for (const page of pages) {
                    const detail = await scrapeDetailPage(page.url);
                    const normalizedTitle = normalizeGojoTitle(page.page_name);
                    const item: BiddingItem = {
                        id: makeId(normalizedTitle, page.url),
                        municipality: '五條市',
                        title: normalizedTitle,
                        type: classifyType(page.page_name),
                        announcementDate: page.publish_datetime.split('T')[0],
                        biddingDate: detail.biddingDate,
                        link: page.url,
                        pdfUrl: detail.pdfUrl,
                        status: '落札',
                    };
                    const key = gojoItemKey(normalizedTitle, detail.biddingDate, page.url);
                    items.set(key, mergeGojoItem(items.get(key), item));
                }
            } catch (e: unknown) {
                console.error('[五條市] フィード取得エラー:', e instanceof Error ? e.message : String(e));
            }
        }

        for (const item of await scrapeEducationPages()) {
            const key = gojoItemKey(item.title, item.biddingDate, item.link);
            items.set(key, mergeGojoItem(items.get(key), item));
        }

        const unique = Array.from(items.values()).sort((a, b) => b.announcementDate.localeCompare(a.announcementDate));
        for (const item of unique) {
            if (item.status !== '落札' || !item.pdfUrl) continue;
            const details = await extractGojoPdfResultDetails(item.pdfUrl);
            if (details.biddingDate) item.biddingDate = details.biddingDate;
            if (details.status) item.status = details.status;
            if (details.winningContractor) item.winningContractor = details.winningContractor;

            const override = GOJO_RESULT_OVERRIDES[item.pdfUrl];
            if (override?.biddingDate) item.biddingDate = override.biddingDate;
            if (override?.status) item.status = override.status;
            if (override?.winningContractor) item.winningContractor = override.winningContractor;
        }
        console.log(`[五條市] 合計 ${unique.length} 件`);
        return unique;
    }
}

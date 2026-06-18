import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, Frame, Page } from 'playwright';
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
    'https://www.city.gojo.lg.jp/material/files/group/40/kkr8hotetenken.pdf': {
        biddingDate: '2026-04-15',
    },
};
const KNOWN_GOJO_ITEMS: Array<Pick<BiddingItem, 'title' | 'announcementDate' | 'biddingDate' | 'link' | 'pdfUrl' | 'type' | 'status' | 'winningContractor' | 'estimatedPrice'>> = [
    {
        title: '五條市立小学校トイレ改修工事',
        announcementDate: '2026-04-21',
        biddingDate: '2026-05-29',
        link: 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KK402ShowAction?control_no=0012960102002501076',
        type: '建築',
        status: '落札',
        winningContractor: '有希建設（株）',
        estimatedPrice: '23,970,000円',
    },
    {
        title: '五條市立小学校トイレ改修工事',
        announcementDate: '2026-04-17',
        link: 'https://www.city.gojo.lg.jp/jigyousha/nyuusatsu/2/12102.html',
        pdfUrl: 'https://www.city.gojo.lg.jp/material/files/group/4/r842.pdf',
        type: '建築',
        status: '受付中',
    },
    {
        title: '五條市立学校給食センター調理室等床改修工事（３期工事）',
        announcementDate: '2026-04-17',
        link: 'https://www.city.gojo.lg.jp/jigyousha/nyuusatsu/2/12102.html',
        pdfUrl: 'https://www.city.gojo.lg.jp/material/files/group/4/r842.pdf',
        type: '建築',
        status: '受付中',
    },
    {
        title: '向加名生団地屋根改修工事',
        announcementDate: '2026-04-17',
        link: 'https://www.city.gojo.lg.jp/jigyousha/nyuusatsu/2/12102.html',
        pdfUrl: 'https://www.city.gojo.lg.jp/material/files/group/4/r842.pdf',
        type: '建築',
        status: '受付中',
    },
    {
        title: 'まちなみ伝承館デッキ改修工事',
        announcementDate: '2026-04-17',
        link: 'https://www.city.gojo.lg.jp/jigyousha/nyuusatsu/2/12102.html',
        pdfUrl: 'https://www.city.gojo.lg.jp/material/files/group/4/r842.pdf',
        type: '建築',
        status: '受付中',
    },
    {
        title: 'まちなみ伝承館外壁修繕工事',
        announcementDate: '2026-04-17',
        link: 'https://www.city.gojo.lg.jp/jigyousha/nyuusatsu/2/12102.html',
        pdfUrl: 'https://www.city.gojo.lg.jp/material/files/group/4/r842.pdf',
        type: '建築',
        status: '受付中',
    },
    {
        title: '五條市大塔ふれあい交流館改修工事監理業務',
        announcementDate: '2026-04-01',
        link: 'https://www.city.gojo.lg.jp/jigyousha/nyuusatsu/2/index.html',
        pdfUrl: 'https://www.city.gojo.lg.jp/material/files/group/4/r843.pdf',
        type: 'コンサル',
        status: '受付中',
    },
    {
        title: '市営住宅外壁等改修工事設計業務委託',
        announcementDate: '2025-07-01',
        link: 'https://www.city.gojo.lg.jp/material/files/group/4/7itaku2.pdf',
        pdfUrl: 'https://www.city.gojo.lg.jp/material/files/group/4/7itaku2.pdf',
        type: 'コンサル',
        status: '受付終了',
    },
    {
        title: '宗桧公民館改修工事設計業務',
        announcementDate: '2025-07-01',
        link: 'https://www.city.gojo.lg.jp/material/files/group/4/7itaku2.pdf',
        pdfUrl: 'https://www.city.gojo.lg.jp/material/files/group/4/7itaku2.pdf',
        type: 'コンサル',
        status: '受付終了',
    },
    {
        title: '宗桧公民館改修工事',
        announcementDate: '2026-05-01',
        biddingDate: '2026-05-01',
        link: 'https://www.city.gojo.lg.jp/jigyousha/nyuusatsu/8/R8/index.html',
        type: '建築',
        status: '不調',
    },
    {
        title: '川端住宅２２・２３号解体工事',
        announcementDate: '2025-12-16',
        biddingDate: '2025-12-16',
        link: 'https://www.city.gojo.lg.jp/jigyousha/nyuusatsu/8/R7/index.html',
        type: '建築',
        status: '落札',
    },
    {
        title: '向加名生団地Ａ棟屋根改修工事',
        announcementDate: '2025-11-18',
        biddingDate: '2025-11-18',
        link: 'https://www.city.gojo.lg.jp/jigyousha/nyuusatsu/8/R7/index.html',
        type: '建築',
        status: '落札',
    },
    {
        title: 'ベストラインスタジアム（上野公園野球場）施設改修工事',
        announcementDate: '2025-11-04',
        biddingDate: '2025-11-04',
        link: 'https://www.city.gojo.lg.jp/jigyousha/nyuusatsu/8/R7/index.html',
        type: '建築',
        status: '落札',
    },
    {
        title: '市営住宅空家修繕工事',
        announcementDate: '2025-10-07',
        biddingDate: '2025-10-07',
        link: 'https://www.city.gojo.lg.jp/jigyousha/nyuusatsu/8/R7/index.html',
        type: '建築',
        status: '落札',
    },
    {
        title: '須恵児童公園トイレ撤去工事',
        announcementDate: '2025-09-30',
        biddingDate: '2025-09-30',
        link: 'https://www.city.gojo.lg.jp/jigyousha/nyuusatsu/8/R7/index.html',
        type: '建築',
        status: '落札',
    },
    {
        title: '阿田峯公園トイレ洋式化工事',
        announcementDate: '2025-07-08',
        biddingDate: '2025-07-08',
        link: 'https://www.city.gojo.lg.jp/jigyousha/nyuusatsu/8/R7/index.html',
        type: '建築',
        status: '落札',
    },
    {
        title: '五條市立田園公民館男子トイレ洋式化工事',
        announcementDate: '2025-07-01',
        biddingDate: '2025-07-01',
        link: 'https://www.city.gojo.lg.jp/jigyousha/nyuusatsu/8/R7/index.html',
        type: '建築',
        status: '落札',
    },
    {
        title: '平沼田老人憩の家屋根修繕工事',
        announcementDate: '2025-06-17',
        biddingDate: '2025-06-17',
        link: 'https://www.city.gojo.lg.jp/jigyousha/nyuusatsu/8/R7/index.html',
        type: '建築',
        status: '落札',
    },
    {
        title: '市営住宅空家修繕工事',
        announcementDate: '2025-05-27',
        biddingDate: '2025-05-27',
        link: 'https://www.city.gojo.lg.jp/jigyousha/nyuusatsu/8/R7/index.html',
        type: '建築',
        status: '落札',
    },
];

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

interface GojoForecastLink {
    announcementDate: string;
    pageUrl: string;
    pdfUrl: string;
}

const STATIC_GOJO_FORECAST_LINKS: GojoForecastLink[] = [
    {
        announcementDate: '2026-04-17',
        pageUrl: `${BASE_URL}/jigyousha/nyuusatsu/2/12102.html`,
        pdfUrl: `${BASE_URL}/material/files/group/4/r842.pdf`,
    },
    {
        announcementDate: '2026-04-17',
        pageUrl: `${BASE_URL}/jigyousha/nyuusatsu/2/12102.html`,
        pdfUrl: `${BASE_URL}/material/files/group/4/r843.pdf`,
    },
];

type GojoDiagnostics = {
    logWarning: (message: string) => void;
    logError: (message: string) => void;
};

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

function compactJapaneseText(text: string): string {
    return text
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .replace(/(?<=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z0-9])\s+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z0-9])/gu, '')
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

async function extractPdfText(pdfUrl: string, maxPages = 8): Promise<string> {
    const res = await axios.get<ArrayBuffer>(pdfUrl, {
        responseType: 'arraybuffer',
        headers: HEADERS,
        timeout: 20000,
    });
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjsLib.getDocument({
        data: new Uint8Array(res.data as ArrayBuffer),
        verbosity: 0,
        isEvalSupported: false,
    }).promise;

    let text = '';
    for (let i = 1; i <= Math.min(doc.numPages, maxPages); i += 1) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => ('str' in item ? item.str : '')).join(' ');
        text += '\n';
    }
    return text;
}

async function scrapeGojoForecastLinks(diagnostics?: GojoDiagnostics): Promise<GojoForecastLink[]> {
    const links = new Map<string, GojoForecastLink>();

    for (const link of STATIC_GOJO_FORECAST_LINKS) {
        links.set(link.pdfUrl, link);
    }

    try {
        const res = await axios.get<CmsPage[]>(`${BASE_URL}/jigyousha/nyuusatsu/2/index.tree.json`, {
            timeout: 15000,
            headers: HEADERS,
        });
        const pages = Array.isArray(res.data)
            ? res.data.filter(page => /公共工事発注見通しの公表/.test(page.page_name))
            : [];

        for (const page of pages) {
            try {
                const detail = await axios.get(page.url, { timeout: 15000, headers: HEADERS });
                const $ = cheerio.load(detail.data);
                $('a[href*=".pdf"]').each((_, anchor) => {
                    const href = $(anchor).attr('href') || '';
                    const text = $(anchor).text().replace(/\s+/g, ' ').trim();
                    if (!/発注見通し公表/.test(text)) return;
                    if (!/(工事|委託)/.test(text)) return;

                    const pdfUrl = href.startsWith('http')
                        ? href
                        : href.startsWith('//')
                            ? `https:${href}`
                            : new URL(href, page.url).toString();
                    links.set(pdfUrl, {
                        announcementDate: page.publish_datetime.split('T')[0],
                        pageUrl: page.url,
                        pdfUrl,
                    });
                });
            } catch (e: unknown) {
                const message = `[五條市] 発注見通し詳細取得エラー: ${page.url} :: ${e instanceof Error ? e.message : String(e)}`;
                diagnostics?.logWarning(message);
                if (!diagnostics) console.warn(message);
            }
        }
    } catch (e: unknown) {
        const message = `[五條市] 発注見通し取得エラー: ${e instanceof Error ? e.message : String(e)}`;
        diagnostics?.logError(message);
        if (!diagnostics) console.error(message);
    }

    return Array.from(links.values());
}

async function scrapeGojoForecastItems(diagnostics?: GojoDiagnostics): Promise<BiddingItem[]> {
    const links = await scrapeGojoForecastLinks(diagnostics);
    const seen = new Map<string, BiddingItem>();
    const titlePattern = /(?:^|\s)(\d+)\s+([^\d]+?(?:工事監理業務|設計業務委託|設計業務|監理業務|改修工事|設置工事|修繕工事|除却工事|解体工事|建設工事|新築工事|業務委託|工事))(?=\s+\S+\s+\d+\s+(?:建築|土木|舗装|暖冷房|電気|機械|建築関係)|\s+\d+\s+|$)/gu;

    for (const link of links) {
        try {
            const text = compactJapaneseText(await extractPdfText(link.pdfUrl, 6));
            const matches = Array.from(text.matchAll(titlePattern));

            for (const match of matches) {
                const rawTitle = compactJapaneseText(match[2] || '');
                if (!rawTitle || !shouldKeepGojoTitle(rawTitle)) continue;

                const key = gojoItemKey(rawTitle, undefined, link.pdfUrl);
                seen.set(key, mergeGojoItem(seen.get(key), {
                    id: makeId(rawTitle, link.pdfUrl),
                    municipality: '五條市',
                    title: rawTitle,
                    type: classifyType(rawTitle),
                    announcementDate: link.announcementDate,
                    link: link.pageUrl,
                    pdfUrl: link.pdfUrl,
                    status: '受付中',
                }));
            }
        } catch (e: unknown) {
            const message = `[五條市] 発注見通しPDF解析エラー: ${link.pdfUrl} :: ${e instanceof Error ? e.message : String(e)}`;
            diagnostics?.logWarning(message);
            if (!diagnostics) console.warn(message);
        }
    }

    return Array.from(seen.values());
}

async function scrapeGojoEpiResults(diagnostics?: GojoDiagnostics): Promise<BiddingItem[]> {
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;
    const items = new Map<string, BiddingItem>();

    try {
        browser = await chromium.launch({ headless: true });
        context = await browser.newContext();
        page = await context.newPage();
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
        const message = `[五條市] EPI取得エラー: ${e instanceof Error ? e.message : String(e)}`;
        diagnostics?.logError(message);
        if (!diagnostics) console.error(message);
    } finally {
        await context?.close().catch(() => undefined);
        await browser?.close().catch(() => undefined);
    }

    return Array.from(items.values());
}

async function scrapeEducationPages(diagnostics?: GojoDiagnostics): Promise<BiddingItem[]> {
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
        const message = `[五條市] 教育委員会ページ取得エラー: ${e instanceof Error ? e.message : String(e)}`;
        diagnostics?.logError(message);
        if (!diagnostics) console.error(message);
        return [];
    }
}


function collapseSupersededGojoItems(items: BiddingItem[]): BiddingItem[] {
    const resolvedTitles = new Set(
        items
            .filter(item => Boolean(item.biddingDate) && (item.status === '落札' || item.status === '不調' || item.status === '受付終了'))
            .map(item => normalizeGojoTitle(item.title)),
    );

    return items.filter(item => {
        if (item.status !== '受付中') return true;
        if (item.biddingDate) return true;
        return !resolvedTitles.has(normalizeGojoTitle(item.title));
    });
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
    private warnings: string[] = [];
    private errors: string[] = [];

    private logWarning(message: string) {
        console.warn(message);
        this.warnings.push(message);
    }

    private logError(message: string) {
        console.error(message);
        this.errors.push(message);
    }

    getDiagnostics() {
        return {
            warnings: [...this.warnings],
            errors: [...this.errors],
        };
    }

    async scrape(): Promise<BiddingItem[]> {
        this.warnings = [];
        this.errors = [];
        const diagnostics: GojoDiagnostics = {
            logWarning: (message) => this.logWarning(message),
            logError: (message) => this.logError(message),
        };
        const items = new Map<string, BiddingItem>();

        for (const item of await scrapeGojoEpiResults(diagnostics)) {
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
                this.logError(`[五條市] フィード取得エラー: ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        for (const item of await scrapeEducationPages(diagnostics)) {
            const key = gojoItemKey(item.title, item.biddingDate, item.link);
            items.set(key, mergeGojoItem(items.get(key), item));
        }

        for (const item of await scrapeGojoForecastItems(diagnostics)) {
            const key = gojoItemKey(item.title, item.biddingDate, item.pdfUrl || item.link);
            items.set(key, mergeGojoItem(items.get(key), item));
        }

        for (const item of KNOWN_GOJO_ITEMS) {
            if (!shouldKeepGojoTitle(item.title)) continue;
            const key = gojoItemKey(item.title, item.biddingDate, item.pdfUrl || item.link);
            items.set(key, mergeGojoItem(items.get(key), {
                id: makeId(item.title, item.pdfUrl || item.link),
                municipality: '五條市',
                title: item.title,
                type: item.type,
                announcementDate: item.announcementDate,
                biddingDate: item.biddingDate,
                link: item.link,
                pdfUrl: item.pdfUrl,
                status: item.status,
                winningContractor: item.winningContractor,
                estimatedPrice: item.estimatedPrice,
            }));
        }

        const unique = collapseSupersededGojoItems(Array.from(items.values()))
            .sort((a, b) => b.announcementDate.localeCompare(a.announcementDate));
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

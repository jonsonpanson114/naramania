import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';
import type { Frame, Page } from 'playwright';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

const SANGO_INDEX = 'https://www.town.sango.nara.jp/soshiki/list8-1.html';
const SANGO_CONTRACT = 'https://www.town.sango.nara.jp/soshiki/4/13385.html';
const SANGO_EPI_FORM = 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0660064007200640';
const EPI_BASE = 'https://www.epi-cloud.fwd.ne.jp';
const TARGET_NENDOS = ['2026', '2025'];
const BASE_URL = 'https://www.town.sango.nara.jp';
const HEADERS = { 'User-Agent': 'Mozilla/5.0' };

function makeAbsoluteUrl(href: string): string {
    if (!href) return SANGO_INDEX;
    if (href.startsWith('http')) return href;
    return `${BASE_URL}${href}`;
}

function parseDate(text: string): string {
    const jp = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (jp) {
        return `${jp[1]}-${jp[2].padStart(2, '0')}-${jp[3].padStart(2, '0')}`;
    }

    const reiwa = text.match(/令和\s*(\d+)年\s*(\d+)月\s*(\d+)日/);
    if (reiwa) {
        const year = 2018 + parseInt(reiwa[1], 10);
        return `${year}-${reiwa[2].padStart(2, '0')}-${reiwa[3].padStart(2, '0')}`;
    }

    return '';
}

function parseUpdatedDate(html: string): string {
    const updated = html.match(/更新日[:：]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (updated) {
        return `${updated[1]}-${updated[2].padStart(2, '0')}-${updated[3].padStart(2, '0')}`;
    }
    return '';
}

function classifyType(title: string): BiddingType {
    if (title.includes('設計') || title.includes('監理') || title.includes('アドバイザリー')) return 'コンサル';
    if (title.includes('委託') || title.includes('業務')) return '委託';
    return '建築';
}

function toAbsoluteEpiUrl(href: string): string {
    if (!href) return SANGO_EPI_FORM;
    if (href.startsWith('javascript:')) return SANGO_EPI_FORM;
    return href.startsWith('http') ? href : `${EPI_BASE}${href}`;
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
    const perPage = frame.locator('select[name="perPage"]');
    if (await perPage.count() > 0) {
        await perPage.selectOption('100').catch(() => undefined);
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
        if (!title || title.length < 5) continue;

        const cells = await row.locator('td').all();
        const cellTexts = await Promise.all(
            cells.map(async (cell) => ((await cell.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()),
        );
        const rowText = cellTexts.join(' ');
        const dates = Array.from(new Set(rowText.match(/\d{4}\/\d{1,2}\/\d{1,2}/g) || []))
            .map(text => parseDate(text.replace(/\//g, '年').replace(/(\d{4})年(\d{1,2})年(\d{1,2})/, '$1年$2月$3日')))
            .filter(Boolean);
        const gyoshu = cellTexts.find(text => /(建築|電気|管|機械|防水|解体|設計|測量|コンサル|監理|調査)/.test(text)) || '';

        if (!shouldKeepItem(title, `${gyoshu} ${rowText}`)) continue;

        const href = await link.getAttribute('href');
        const fullLink = toAbsoluteEpiUrl(href || '');
        const announcementDate = dates[0] || '';
        const biddingDate = dates[1] || undefined;
        if (!announcementDate) continue;

        items.push({
            id: `sango-epi-${Buffer.from(`${title}|${fullLink}|${announcementDate}`).toString('base64').slice(0, 12)}`,
            municipality: '三郷町',
            title,
            type: classifyType(`${title} ${gyoshu}`),
            announcementDate,
            biddingDate,
            link: fullLink,
            status: '受付中',
        });
    }

    return items;
}

async function scrapeEpiCategory(page: Page, categoryLabel: string): Promise<BiddingItem[]> {
    await page.goto(SANGO_EPI_FORM, { waitUntil: 'load' });
    await page.waitForTimeout(2000);
    await page.locator('span.ATYPE').filter({ hasText: categoryLabel }).first().click({ force: true, timeout: 30000 });
    await page.waitForTimeout(3000);

    const results: BiddingItem[] = [];
    const issueFrame = await clickRightMenu(page, '発注情報の検索');
    if (!issueFrame) return results;

    for (const nendo of TARGET_NENDOS) {
        const optionCount = await issueFrame.locator(`select[name="nendo"] option[value="${nendo}"]`).count();
        if (optionCount === 0) continue;

        await submitIssueSearch(issueFrame, nendo);
        await page.waitForTimeout(2500);
        let dataFrame = await getDataFrame(page);
        while (dataFrame) {
            const items = await extractIssueResults(dataFrame);
            results.push(...items);

            const nextLink = dataFrame.locator('a').filter({ hasText: '次へ' }).first();
            if (await nextLink.count() === 0) break;

            await nextLink.click({ force: true, timeout: 10000 }).catch(() => undefined);
            await page.waitForTimeout(1500);
            dataFrame = await getDataFrame(page);
        }
    }

    return results;
}

export class SangoTownScraper implements Scraper {
    municipality: '三郷町' = '三郷町' as const;

    async scrape(): Promise<BiddingItem[]> {
        const items = new Map<string, BiddingItem>();

        try {
            const [indexRes, contractRes] = await Promise.all([
                axios.get(SANGO_INDEX, { headers: HEADERS, timeout: 15000 }),
                axios.get(SANGO_CONTRACT, { headers: HEADERS, timeout: 15000 }),
            ]);

            const $index = cheerio.load(indexRes.data);
            const $contract = cheerio.load(contractRes.data);

            // 最新の入札一覧ページから、現在募集中のリンクを拾う。
            $index('a').each((_, el) => {
                const title = $index(el).text().trim();
                const href = $index(el).attr('href') || '';
                if (!title || !href) return;
                if (!title.includes('入札')) return;
                if (!shouldKeepItem(title)) return;

                const link = makeAbsoluteUrl(href);
                const date = parseDate(title) || parseUpdatedDate(indexRes.data);
                const id = `sango-open-${Buffer.from(link).toString('base64').slice(0, 12)}`;

                items.set(id, {
                    id,
                    municipality: '三郷町',
                    title,
                    type: classifyType(title),
                    announcementDate: date,
                    link,
                    status: '受付中',
                });
            });

            // 契約状況一覧から落札済み案件を拾う。
            $contract('a').each((_, el) => {
                const title = $contract(el).parent().next().text().replace(/\s+/g, ' ').trim();
                const href = $contract(el).attr('href') || '';
                if (!title || !href) return;
                if (!shouldKeepItem(title)) return;

                const link = makeAbsoluteUrl(href);
                const id = `sango-result-${Buffer.from(link).toString('base64').slice(0, 12)}`;
                const sectionText = $contract(el).closest('section, div, article, li, tr').text();
                const date = parseDate(sectionText) || parseUpdatedDate(contractRes.data);

                items.set(id, {
                    id,
                    municipality: '三郷町',
                    title,
                    type: classifyType(title),
                    announcementDate: date,
                    link,
                    status: '落札',
                });
            });

            const browser = await chromium.launch({ headless: true });
            try {
                const page = await browser.newPage();
                page.setDefaultTimeout(120000);
                await page.goto(SANGO_EPI_FORM, { waitUntil: 'load' });
                await page.waitForTimeout(2000);

                const serviceText = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
                if (!serviceText.includes('サービス停止中')) {
                    for (const categoryLabel of ['工事', 'コンサル']) {
                        const epiItems = await scrapeEpiCategory(page, categoryLabel);
                        epiItems.forEach(item => items.set(item.id, item));
                    }
                }
            } finally {
                await browser.close();
            }

        } catch (error: unknown) {
            console.error('[三郷町] エラー:', error instanceof Error ? error.message : String(error));
        }

        const result = Array.from(items.values()).sort((a, b) => b.announcementDate.localeCompare(a.announcementDate));
        console.log(`[三郷町] 合計 ${result.length} 件`);
        return result;
    }
}

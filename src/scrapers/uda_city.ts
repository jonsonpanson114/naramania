import { chromium } from 'playwright';
import type { Frame, Page } from 'playwright';
import crypto from 'crypto';
import { BiddingItem, BiddingType, Scraper } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

const EPI_CLOUD_FORM = 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200700';
const EPI_BASE = 'https://www.epi-cloud.fwd.ne.jp';
const TARGET_NENDOS = ['2026', '2025'];

function parseJapaneseDate(text: string): string {
    const reiwa = text.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (reiwa) {
        const year = 2018 + parseInt(reiwa[1], 10);
        return `${year}-${reiwa[2].padStart(2, '0')}-${reiwa[3].padStart(2, '0')}`;
    }

    const western = text.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/);
    if (western) {
        return `${western[1]}-${western[2].padStart(2, '0')}-${western[3].padStart(2, '0')}`;
    }

    return '';
}

function classifyType(title: string, gyoshu: string): BiddingType {
    const target = `${title} ${gyoshu}`;
    if (/(設計|測量|コンサル|監理|調査)/.test(target)) return 'コンサル';
    if (/(委託|業務)/.test(target)) return '委託';
    return '建築';
}

function toAbsoluteUrl(href: string): string {
    if (!href) return EPI_CLOUD_FORM;
    if (href.startsWith('javascript:')) return EPI_CLOUD_FORM;
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
            .map(text => parseJapaneseDate(text))
            .filter(Boolean);
        const gyoshu = cellTexts.find(text => /(建築|電気|管|機械|防水|解体|設計|測量|コンサル|監理|調査)/.test(text)) || '';

        if (!shouldKeepItem(title, `${gyoshu} ${rowText}`)) continue;

        const href = await link.getAttribute('href');
        const fullLink = toAbsoluteUrl(href || '');
        const announcementDate = dates[0] || '';
        const biddingDate = dates[1] || undefined;
        if (!announcementDate) continue;

        items.push({
            id: `uda-${crypto.createHash('md5').update(`${title}|${fullLink}|${announcementDate}`).digest('hex').slice(0, 10)}`,
            municipality: '宇陀市',
            title,
            type: classifyType(title, gyoshu),
            announcementDate,
            biddingDate,
            link: fullLink,
            status: '受付中',
        });
    }

    return items;
}

async function scrapeCategory(page: Page, categoryLabel: string): Promise<BiddingItem[]> {
    await page.goto(EPI_CLOUD_FORM, { waitUntil: 'load' });
    await page.waitForTimeout(2000);
    await page.locator('span.ATYPE').filter({ hasText: categoryLabel }).first().click({ force: true, timeout: 30000 });
    await page.waitForTimeout(3000);

    const results: BiddingItem[] = [];
    const issueFrame = await clickRightMenu(page, '発注情報の検索');
    if (!issueFrame) {
        console.warn(`[宇陀市] ${categoryLabel}: 発注情報の検索メニューが見つかりません。`);
        return results;
    }

    for (const nendo of TARGET_NENDOS) {
        try {
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
        } catch (error) {
            console.warn(`[宇陀市] ${categoryLabel} ${nendo}年度検索エラー:`, error instanceof Error ? error.message : String(error));
        }
    }

    return results;
}

export class UdaCityScraper implements Scraper {
    municipality: '宇陀市' = '宇陀市' as const;

    async scrape(): Promise<BiddingItem[]> {
        const browser = await chromium.launch({ headless: true });
        const itemsById = new Map<string, BiddingItem>();

        try {
            const page = await browser.newPage();
            page.setDefaultTimeout(120000);
            await page.goto(EPI_CLOUD_FORM, { waitUntil: 'load' });
            await page.waitForTimeout(2000);

            const serviceText = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
            if (serviceText.includes('サービス停止中') && serviceText.includes('情報公開')) {
                console.warn('[宇陀市] EPI 情報公開サービス停止中のため取得をスキップします。');
                return [];
            }

            for (const categoryLabel of ['工事', 'コンサル']) {
                const items = await scrapeCategory(page, categoryLabel);
                for (const item of items) {
                    itemsById.set(item.id, item);
                }
            }
        } catch (error) {
            console.error('[宇陀市] スクレイパーエラー:', error instanceof Error ? error.message : String(error));
        } finally {
            await browser.close();
        }

        const items = Array.from(itemsById.values());
        console.log(`[宇陀市] 合計 ${items.length} 件取得`);
        return items;
    }
}

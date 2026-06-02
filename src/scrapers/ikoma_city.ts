import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';
import type { Frame, Page } from 'playwright';
import crypto from 'crypto';
import { BiddingItem, BiddingType, Scraper } from '../types/bidding';
import { classifyWinner, shouldKeepItem } from './common/filter';
import { parseJapaneseDateToIso } from './common/pdf_text';

const EPI_CLOUD_FORM = 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680';
const EPI_BASE = 'https://www.epi-cloud.fwd.ne.jp';
const TARGET_NENDOS = ['2026', '2025'];
const IKOMA_SUPPLEMENTAL_PAGES = [
    'https://www.city.ikoma.lg.jp/0000038734.html',
];

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

function normalizeIkomaTitle(title: string): string {
    return title.normalize('NFKC').replace(/\s+/g, '').trim();
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
            id: `ikoma-${crypto.createHash('md5').update(`${title}|${fullLink}|${announcementDate}`).digest('hex').slice(0, 10)}`,
            municipality: '生駒市',
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
        console.warn(`[生駒市] ${categoryLabel}: 発注情報の検索メニューが見つかりません。`);
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
            console.warn(`[生駒市] ${categoryLabel} ${nendo}年度検索エラー:`, error instanceof Error ? error.message : String(error));
        }
    }

    return results;
}

function parseIkomaPageDate(text: string): string {
    const match = text.match(/(?:更新日|公開日)[：:\s]*((?:20\d{2}|令和\s*\d+)\s*年\s*\d+\s*月\s*\d+\s*日)/u);
    return match ? parseJapaneseDateToIso(match[1]) || '' : '';
}

function parseIkomaSupplementalBiddingDate(text: string): string | undefined {
    const patterns = [
        /(?:プレゼンテーション・ヒアリング|審査会|選定委員会)[^\n\r]*?((?:20\d{2}|令和\s*\d+)\s*年\s*\d+\s*月\s*\d+\s*日)/u,
        /(?:開札日|入札日)[：:\s]*((?:20\d{2}|令和\s*\d+)\s*年\s*\d+\s*月\s*\d+\s*日)/u,
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        const iso = match ? parseJapaneseDateToIso(match[1]) : '';
        if (iso) return iso;
    }
    return undefined;
}

function parseIkomaSupplementalWinner(text: string): string | undefined {
    const patterns = [
        /受託候補者[：:\s]*([^\n\r]+?)(?:\s{2,}|$)/u,
        /優先交渉権者[：:\s]*([^\n\r]+?)(?:\s{2,}|$)/u,
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        const winner = match?.[1]?.replace(/\s+/g, ' ').trim();
        if (winner) return winner;
    }
    return undefined;
}

async function scrapeSupplementalPages(): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];

    for (const url of IKOMA_SUPPLEMENTAL_PAGES) {
        try {
            const res = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 20000,
            });
            const $ = cheerio.load(res.data);
            const title = $('h1').first().text().replace(/\s+/g, ' ').trim();
            const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
            if (!title || !shouldKeepItem(title, bodyText)) continue;

            const winningContractor = parseIkomaSupplementalWinner(bodyText);
            items.push({
                id: `ikoma-supplemental-${crypto.createHash('md5').update(url).digest('hex').slice(0, 10)}`,
                municipality: '生駒市',
                title,
                type: classifyType(title, bodyText),
                announcementDate: parseIkomaPageDate(bodyText) || new Date().toISOString().split('T')[0],
                biddingDate: parseIkomaSupplementalBiddingDate(bodyText),
                link: url,
                status: winningContractor ? '落札' : '受付中',
                winningContractor,
                winnerType: classifyWinner(winningContractor || ''),
            });
        } catch (error) {
            console.warn('[生駒市] 補助ページ取得エラー:', error instanceof Error ? error.message : String(error));
        }
    }

    return items;
}

async function submitResultSearch(frame: Frame, nendo: string) {
    await frame.waitForSelector('form[name="KK401DynaActionForm"]', { timeout: 30000 });
    await frame.selectOption('select[name="nendo"]', nendo);
    const perPage = frame.locator('select[name="A300"], select[name="perPage"]');
    if (await perPage.count() > 0) {
        await perPage.first().selectOption('100').catch(() => undefined);
    }
    await frame.locator('input[type="button"][value="検索"]').first().click({ force: true, timeout: 30000 });
}

async function extractResultResults(frame: Frame): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];
    const rows = await frame.locator('table tr').all().catch(() => []);

    for (const row of rows) {
        const cells = await row.locator('td').all();
        if (cells.length < 7) continue;

        const title = ((await cells[2].innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        if (!title || !shouldKeepItem(title)) continue;

        const biddingDate = parseJapaneseDate(((await cells[1].innerText().catch(() => '')) || '').trim()) || undefined;
        const contractNo = ((await cells[3].innerText().catch(() => '')) || '').replace(/\s+/g, '').trim();
        const winnerRaw = ((await cells[5].innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        const winner = winnerRaw && winnerRaw !== '-' ? winnerRaw : undefined;
        const amountText = ((await cells[6].innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        const isFailed = /取止め|不調/.test(amountText);
        const titleLink = row.locator('a').first();
        const href = await titleLink.getAttribute('href').catch(() => null);

        items.push({
            id: contractNo
                ? `ikoma-result-${contractNo}`
                : `ikoma-result-${crypto.createHash('md5').update(`${title}|${href || ''}|${biddingDate || ''}`).digest('hex').slice(0, 10)}`,
            municipality: '生駒市',
            title,
            type: classifyType(title, ''),
            announcementDate: biddingDate || '',
            biddingDate,
            link: toAbsoluteUrl(href || ''),
            status: isFailed ? '不調' : '落札',
            winningContractor: isFailed ? undefined : winner,
            winnerType: classifyWinner(winner || ''),
        });
    }

    return items;
}

export class IkomaCityScraper implements Scraper {
    municipality: '生駒市' = '生駒市' as const;
    private warnings: string[] = [];
    private errors: string[] = [];

    private addWarning(message: string) {
        this.warnings.push(message);
        console.warn(message);
    }

    private addError(message: string) {
        this.errors.push(message);
        console.error(message);
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
        const browser = await chromium.launch({ headless: true });
        const itemsById = new Map<string, BiddingItem>();
        const itemsByTitle = new Map<string, BiddingItem>();

        const upsert = (item: BiddingItem) => {
            const key = normalizeIkomaTitle(item.title);
            const existing = itemsByTitle.get(key);
            if (!existing) {
                itemsByTitle.set(key, item);
                itemsById.set(item.id, item);
                return;
            }

            if (item.announcementDate && (!existing.announcementDate || item.announcementDate < existing.announcementDate)) {
                existing.announcementDate = item.announcementDate;
            }
            if (item.biddingDate && !existing.biddingDate) existing.biddingDate = item.biddingDate;
            if (item.link && (!existing.link || existing.link === EPI_CLOUD_FORM)) existing.link = item.link;
            if (item.winningContractor && !existing.winningContractor) {
                existing.winningContractor = item.winningContractor;
                existing.winnerType = item.winnerType;
            }
            if (item.status === '落札' || item.status === '不調') existing.status = item.status;
        };

        try {
            const page = await browser.newPage();
            page.setDefaultTimeout(120000);
            await page.goto(EPI_CLOUD_FORM, { waitUntil: 'load' });
            await page.waitForTimeout(2000);

            const serviceText = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
            if (serviceText.includes('サービス停止中') && serviceText.includes('情報公開')) {
                this.addWarning('[生駒市] EPI 情報公開サービス停止中のため取得をスキップします。');
                return [];
            }

            for (const categoryLabel of ['工事', 'コンサル']) {
                const items = await scrapeCategory(page, categoryLabel);
                for (const item of items) {
                    upsert(item);
                }
            }

            for (const categoryLabel of ['工事', 'コンサル']) {
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
                        const items = await extractResultResults(dataFrame);
                        for (const item of items) {
                            upsert(item);
                        }

                        const nextLink = dataFrame.locator('a').filter({ hasText: '次へ' }).first();
                        if (await nextLink.count() === 0) break;

                        await nextLink.click({ force: true, timeout: 10000 }).catch(() => undefined);
                        await page.waitForTimeout(1500);
                        dataFrame = await getDataFrame(page);
                    }
                }
            }
        } catch (error) {
            this.addError(`[生駒市] スクレイパーエラー: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            await browser.close();
        }

        const supplementalItems = await scrapeSupplementalPages();
        for (const item of supplementalItems) {
            upsert(item);
        }

        const items = Array.from(itemsByTitle.values());
        console.log(`[生駒市] 合計 ${items.length} 件取得`);
        return items;
    }
}

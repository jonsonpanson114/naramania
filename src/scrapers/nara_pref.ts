import fs from 'fs';
import path from 'path';
import { chromium, Frame, Page } from 'playwright';
import { BiddingItem, Scraper, BiddingStatus, BiddingType } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

const PPI_SEARCH_URL = 'https://ppi.ebid-kouji-gyoumu.pref.nara.jp/DENCHO/PPJ/PPJ0050_0010/';
const PPI_DETAIL_BASE = 'https://ppi.ebid-kouji-gyoumu.pref.nara.jp/DENCHO/PPJ/PPC0050_0020/';
const RESULT_PATH = path.join(process.cwd(), 'scraper_result.json');

const KOJI_GYOSHU_SKIP = [
    '土木一式', '舗装', '鋼橋', 'PC橋', '造園', '法面処理', '道路等維持修繕',
    'しゅんせつ', 'グラウト', 'さく井', '上下水道設備', '交通安全施設', '土木施設除草業務',
    '通信設備', '橋梁', '橋', '測量',
];

const SEARCH_TARGETS = [
    {
        gyomuType: '02',
        type: 'コンサル' as BiddingType,
        label: 'コンサル',
        gyoushuCodes: ['0300000'],
    },
    {
        gyomuType: '01',
        type: '建築' as BiddingType,
        label: '工事',
        gyoushuCodes: ['0000200', '0001700'],
    },
];

type SearchRow = {
    kanriNo: string;
    gyomuType: string;
    gyoshu: string;
    title: string;
    announcementText: string;
    biddingText: string;
};

type DetailInfo = {
    status: BiddingStatus;
    winningContractor?: string;
    skip: boolean;
};

type SearchSurface = Page | Frame;

function parseJapaneseDate(text: string): string {
    const match = text.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (!match) return '';
    const year = 2018 + parseInt(match[1], 10);
    return `${year}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function formatJapaneseEraDate(date: Date): string {
    const year = date.getFullYear() - 2018;
    return `令和${String(year).padStart(2, '0')}年${String(date.getMonth() + 1).padStart(2, '0')}月${String(date.getDate()).padStart(2, '0')}日`;
}

function formatHiddenDate(date: Date): string {
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

function fiscalYearForDate(date: Date): string {
    return date.getMonth() >= 3 ? String(date.getFullYear()) : String(date.getFullYear() - 1);
}

function startOfFiscalYear(referenceDate: Date): Date {
    const year = referenceDate.getMonth() >= 3 ? referenceDate.getFullYear() : referenceDate.getFullYear() - 1;
    return new Date(year, 3, 1);
}

function parsePositiveIntegerEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;

    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isoDateDaysBefore(referenceDate: Date, days: number): string {
    const date = new Date(referenceDate);
    date.setDate(date.getDate() - days);
    return date.toISOString().slice(0, 10);
}

function extractKanriNoFromItem(item: BiddingItem): string | undefined {
    if (item.id.startsWith('nara-pref-')) {
        return item.id.replace(/^nara-pref-/, '');
    }

    try {
        const url = new URL(item.link);
        return url.searchParams.get('kanriNo') || undefined;
    } catch {
        return undefined;
    }
}

function loadExistingNaraPrefItems(): BiddingItem[] {
    if (!fs.existsSync(RESULT_PATH)) return [];

    try {
        const items = JSON.parse(fs.readFileSync(RESULT_PATH, 'utf-8')) as BiddingItem[];
        return items.filter((item) => item.municipality === '奈良県');
    } catch {
        return [];
    }
}

function getSearchSurfaces(page: Page): SearchSurface[] {
    return [page, ...page.frames().filter((frame) => frame !== page.mainFrame())];
}

async function waitForSearchDom(page: Page) {
    const timeoutMs = 20000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        const [hasForm, hasNendo, hasTab01, hasTab02] = await Promise.all([
            page.locator('#PPJ0050_0010').count(),
            page.locator('#searchJyokenNendo').count(),
            page.locator('#GyomuTypeTab01').count(),
            page.locator('#GyomuTypeTab02').count(),
        ]);

        if (hasForm && hasNendo && (hasTab01 || hasTab02)) {
            return;
        }

        await page.waitForTimeout(1000);
    }

    const debugInfo = await collectSearchDebugInfo(page, '');
    throw new Error(`search DOM not ready: ${JSON.stringify(debugInfo)}`);
}

async function collectSearchDebugInfo(page: Page, gyomuType: string) {
    const bodySample = await page.evaluate(() =>
        (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300),
    ).catch(() => '');
    const frameInfos = page.frames().map((frame, index) => ({
        index,
        name: frame.name() || '(no-name)',
        url: frame.url(),
    }));
    const candidateInfos = await Promise.all(getSearchSurfaces(page).map(async (surface, index) => {
        const candidates = await surface.evaluate((type) => {
            const tabNodes = Array.from(document.querySelectorAll('[id*="GyomuTypeTab"], a, button, input[type="button"], li'));
            return tabNodes
                .map((node) => {
                    const element = node as HTMLElement;
                    const text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
                    const id = element.id || '';
                    const cls = element.className || '';
                    return { id, cls, text };
                })
                .filter((entry) =>
                    entry.id.includes('GyomuTypeTab')
                    || entry.text.includes('工事')
                    || entry.text.includes('コンサル')
                    || entry.text.includes('測量')
                    || entry.text.includes(type),
                )
                .slice(0, 12);
        }, gyomuType).catch(() => []);

        return {
            surface: index,
            url: 'url' in surface ? surface.url() : '',
            candidates,
        };
    }));

    return {
        bodySample,
        frames: frameInfos,
        candidates: candidateInfos,
    };
}

async function clickGyomuTab(page: Page, gyomuType: string, label: string): Promise<SearchSurface> {
    const idSelectors = [
        `#GyomuTypeTab${gyomuType}`,
        `[id="GyomuTypeTab${gyomuType}"]`,
        `[id*="GyomuTypeTab${gyomuType}"]`,
    ];
    const textKeywords = gyomuType === '01'
        ? ['工事']
        : ['コンサル', '測量'];

    for (const surface of getSearchSurfaces(page)) {
        for (const selector of idSelectors) {
            const locator = surface.locator(selector).first();
            if (await locator.count()) {
                await locator.scrollIntoViewIfNeeded().catch(() => { });
                await locator.click({ timeout: 10000, force: true });
                return surface;
            }
        }

        for (const keyword of [label, ...textKeywords]) {
            const locator = surface.getByText(keyword, { exact: false }).first();
            if (await locator.count()) {
                await locator.scrollIntoViewIfNeeded().catch(() => { });
                await locator.click({ timeout: 10000, force: true });
                return surface;
            }
        }
    }

    const debugInfo = await collectSearchDebugInfo(page, gyomuType);
    throw new Error(`gyomu tab not found: ${JSON.stringify(debugInfo)}`);
}

async function selectOptionFromSurface(surface: SearchSurface, selectors: string[], value: string) {
    let lastError: unknown;

    for (const selector of selectors) {
        const locator = surface.locator(selector).first();
        if (!(await locator.count())) continue;
        try {
            await surface.selectOption(selector, value);
            return;
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError instanceof Error ? lastError : new Error(`select option failed for selectors: ${selectors.join(', ')}`);
}

async function clickSearchButton(surface: SearchSurface) {
    const selectors = ['#search', 'input#search', 'button#search'];
    for (const selector of selectors) {
        const locator = surface.locator(selector).first();
        if (!(await locator.count())) continue;
        await locator.click({ timeout: 10000, force: true });
        return;
    }

    throw new Error('search button not found');
}

async function openSearchPage(page: Page, gyomuType: string, fiscalYear: string, gyoushuCode: string, label: string): Promise<SearchSurface> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            console.log(`[奈良県] openSearchPage url=${PPI_SEARCH_URL} gyomuType=${gyomuType} fiscalYear=${fiscalYear} gyoushu=${gyoushuCode || 'all'}`);
            await page.goto(PPI_SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(1500);
            await waitForSearchDom(page);
            await dismissPopup(page);

            const searchSurface = await clickGyomuTab(page, gyomuType, label);
            await page.waitForTimeout(1000);

            await selectOptionFromSurface(searchSurface, ['#searchJyokenNendo', '#PPJ0050_0010 #searchJyokenNendo'], fiscalYear);
            await page.waitForTimeout(300);

            if (gyoushuCode) {
                await selectOptionFromSurface(searchSurface, ['#searchJyokenGyoushuCd1', '#PPJ0050_0010 #searchJyokenGyoushuCd1'], gyoushuCode).catch(() => { });
                await page.waitForTimeout(300);
            }

            return searchSurface;
        } catch (error) {
            lastError = error;
            console.warn(
                `[奈良県] openSearchPage retry ${attempt}/3 failed:`,
                error instanceof Error ? error.message : String(error),
            );
            await page.waitForTimeout(1500 * attempt);
        }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function dismissPopup(page: Page) {
    const visible = await page.locator('#bg_pop.display_b').count();
    if (!visible) return;

    await page.locator('#ok').click().catch(() => { });
    await page.waitForTimeout(300);

    const stillVisible = await page.locator('#bg_pop.display_b').count();
    if (stillVisible) {
        await page.evaluate(() => {
            const popup = document.getElementById('bg_pop');
            if (popup) popup.className = popup.className.replace('display_b', 'display_n');
        }).catch(() => { });
        await page.waitForTimeout(200);
    }
}

async function applyDateRange(surface: SearchSurface, start: Date, end: Date) {
    await surface.evaluate(({ startEra, startHidden, endEra, endHidden }) => {
        const startVisible = document.getElementById('searchJyokenKoukokuShimeiTsuchiDatetimeStart') as HTMLInputElement | null;
        const startValue = document.getElementById('hidSearchJyokenKoukokuShimeiTsuchiDatetimeStart') as HTMLInputElement | null;
        const endVisible = document.getElementById('searchJyokenKoukokuShimeiTsuchiDatetimeEnd') as HTMLInputElement | null;
        const endValue = document.getElementById('hidSearchJyokenKoukokuShimeiTsuchiDatetimeEnd') as HTMLInputElement | null;

        if (startVisible) startVisible.value = startEra;
        if (startValue) startValue.value = startHidden;
        if (endVisible) endVisible.value = endEra;
        if (endValue) endValue.value = endHidden;
    }, {
        startEra: formatJapaneseEraDate(start),
        startHidden: formatHiddenDate(start),
        endEra: formatJapaneseEraDate(end),
        endHidden: formatHiddenDate(end),
    });
}

async function extractRows(surface: SearchSurface): Promise<SearchRow[]> {
    return await surface.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('input[id^="kanriNo_"]'));
        const results: SearchRow[] = [];

        for (const input of rows) {
            const kanriNo = (input as HTMLInputElement).value;
            const idx = input.id.split('_')[1];
            const firstRow = input.closest('tr');
            const secondRow = firstRow?.nextElementSibling as HTMLTableRowElement | null;
            const gyomuType = (document.getElementById(`gyomuType_${idx}`) as HTMLInputElement | null)?.value || '';
            const firstValues: Record<string, string> = {};
            const secondValues: Record<string, string> = {};

            const firstCells = Array.from((firstRow as HTMLTableRowElement | null)?.querySelectorAll('td') || []);
            for (const td of firstCells) {
                const divs = Array.from(td.querySelectorAll('div')).map(div => (div.textContent || '').replace(/\s+/g, ' ').trim());
                if (divs.length >= 2 && divs[0] && divs[1]) firstValues[divs[0]] = divs[1];
            }

            const secondCells = Array.from(secondRow?.querySelectorAll('td') || []);
            for (const td of secondCells) {
                const divs = Array.from(td.querySelectorAll('div')).map(div => (div.textContent || '').replace(/\s+/g, ' ').trim());
                if (divs.length >= 2 && divs[0] && divs[1]) secondValues[divs[0]] = divs[1];
            }

            const title = firstValues['工事名'] || firstValues['業務名'] || '';
            if (!kanriNo || !title) continue;

            results.push({
                kanriNo,
                gyomuType,
                gyoshu: firstValues['工種'] || firstValues['業種'] || '',
                title,
                announcementText: firstValues['公告日／指名通知日'] || '',
                biddingText: secondValues['開札予定日'] || '',
            });
        }

        return results;
    });
}

async function hasNoResultPopup(page: Page): Promise<boolean> {
    const visible = await page.locator('#bg_pop.display_b').count();
    if (!visible) return false;

    const message = await page.locator('#ShowMessage').textContent().catch(() => '');
    console.log(`[奈良県] popup message: ${message || '(empty)'}`);
    await dismissPopup(page);
    if (message?.includes('0件')) {
        return true;
    }

    return false;
}

async function readVisibleDetailInfo(page: Page, fallbackStatus: BiddingStatus): Promise<DetailInfo> {
    return await page.evaluate((fallback) => {
        const text = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
        const hasResult = /入札結果|落札結果|開札結果/.test(text)
            || (document.getElementById('nyusatsuKekkaFlg') as HTMLInputElement | null)?.value === '1'
            || (document.getElementById('keiyakuNaiyoFlg') as HTMLInputElement | null)?.value === '1';
        const isCanceled = /【中止】|中止となりました|取止め|取り止め|入札中止/.test(text);
        const isUnsuccessful = /不調|不落|取止め|取り止め|入札参加者なし|中止しました/.test(text);

        const winnerPatterns = [
            /落札者\s*[:：]?\s+(.+?)(?=\s+(?:落札金額|落札額|契約金額|予定価格|最低制限|調査基準価格|入札金額|$))/,
            /落札業者\s*[:：]?\s+(.+?)(?=\s+(?:落札金額|落札額|契約金額|予定価格|最低制限|調査基準価格|入札金額|$))/,
            /落札候補者\s*[:：]?\s+(.+?)(?=\s+(?:落札金額|落札額|契約金額|予定価格|最低制限|調査基準価格|入札金額|$))/,
            /契約業者名\s*[:：]?\s+(.+?)(?=\s+(?:代表者氏名|契約業者住所|契約金額|請負契約額|契約日|$))/,
        ];
        let winningContractor: string | undefined;
        for (const pattern of winnerPatterns) {
            const match = text.match(pattern);
            if (!match?.[1]) continue;

            const cleaned = match[1]
                .replace(/^(商号又は名称|名称|業者名)\s*[:：]?\s*/, '')
                .replace(/\s+/g, ' ')
                .trim();
            if (
                cleaned.length > 0
                && !/^￥/.test(cleaned)
                && !/落札金額|落札額|契約金額|予定価格|最低制限|調査基準価格|入札金額/.test(cleaned)
            ) {
                winningContractor = cleaned;
                break;
            }
        }

        return {
            status: winningContractor ? '落札' : hasResult && isUnsuccessful ? '不調' : fallback,
            winningContractor,
            skip: isCanceled && !hasResult,
        };
    }, fallbackStatus);
}

async function clickDetailTabIfPresent(page: Page, selector: string): Promise<boolean> {
    const tab = page.locator(selector);
    if (await tab.count() === 0) return false;

    await tab.first().click();
    await page.waitForTimeout(1200);
    return true;
}

async function fetchDetailInfo(page: Page, kanriNo: string, fallbackStatus: BiddingStatus): Promise<DetailInfo> {
    const detailUrl = `${PPI_DETAIL_BASE}?kanriNo=${kanriNo}&gamenMode=0`;
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(800);

    let detail = await readVisibleDetailInfo(page, fallbackStatus);
    if (detail.winningContractor) return detail;

    const hasResultFlag = await page.locator('#nyusatsuKekkaFlg').inputValue().catch(() => '') === '1';
    if (hasResultFlag && await clickDetailTabIfPresent(page, '#tabNyusatsuKekka')) {
        detail = await readVisibleDetailInfo(page, fallbackStatus);
        if (detail.winningContractor || detail.status === '不調') return detail;
    }

    const hasContractFlag = await page.locator('#keiyakuNaiyoFlg').inputValue().catch(() => '') === '1';
    if (hasContractFlag && await clickDetailTabIfPresent(page, '#tabKeiyakuNaiyo')) {
        detail = await readVisibleDetailInfo(page, fallbackStatus);
    }

    return detail;
}

export class NaraPrefScraper implements Scraper {
    municipality: '奈良県' = '奈良県' as const;
    private warnings: string[] = [];
    private errors: string[] = [];

    private recordWarning(message: string) {
        this.warnings.push(message);
        console.warn(message);
    }

    private recordError(message: string) {
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
        const searchPage = await browser.newPage();
        const detailPage = await browser.newPage();
        const items = new Map<string, BiddingItem>();

        try {
            const referenceDate = new Date();
            const todayIso = referenceDate.toISOString().slice(0, 10);
            const resultLookbackDays = parsePositiveIntegerEnv('NARA_PREF_RESULT_LOOKBACK_DAYS', 370);
            const resultLookbackIso = isoDateDaysBefore(referenceDate, resultLookbackDays);
            let detailFetchCount = 0;
            const detailFetchLimit = parsePositiveIntegerEnv('NARA_PREF_DETAIL_FETCH_LIMIT', 80);
            const scrapeDeadline = Date.now() + 150000;
            const fiscalYear = fiscalYearForDate(referenceDate);
            const searchStart = startOfFiscalYear(referenceDate);
            const searchEnd = referenceDate;

            for (const target of SEARCH_TARGETS) {
                console.log(`[奈良県] ${target.label} 新サイト取得中...`);
                let deadlineReached = false;

                for (const gyoushuCode of target.gyoushuCodes) {
                    if (Date.now() > scrapeDeadline) {
                        this.recordWarning(`[奈良県] 時間上限に達したため ${target.label} の残り検索を打ち切ります`);
                        deadlineReached = true;
                        break;
                    }
                    try {
                        const searchSurface = await openSearchPage(searchPage, target.gyomuType, fiscalYear, gyoushuCode, target.label);
                        await applyDateRange(searchSurface, searchStart, searchEnd);
                        await clickSearchButton(searchSurface);
                        await searchPage.waitForTimeout(3500);
                        console.log(`[奈良県] search submitted gyomu=${target.gyomuType} gyoushu=${gyoushuCode || 'all'} range=${searchStart.toISOString().slice(0, 10)}..${searchEnd.toISOString().slice(0, 10)}`);

                        if (await hasNoResultPopup(searchPage)) {
                            console.log(`[奈良県] ${target.label} ${gyoushuCode || 'all'} ${searchStart.toISOString().slice(0, 10)}: 0件`);
                            continue;
                        }

                        const rows = await extractRows(searchSurface);
                        console.log(`[奈良県] ${target.label} ${gyoushuCode || 'all'} ${searchStart.toISOString().slice(0, 10)}: ${rows.length}件 raw rows`);

                        for (const row of rows) {
                            if (row.title.includes('【中止】')) continue;
                            if (target.gyomuType === '01' && KOJI_GYOSHU_SKIP.some(keyword => row.gyoshu.includes(keyword))) continue;
                            if (!shouldKeepItem(row.title, row.gyoshu)) continue;

                            const announcementDate = parseJapaneseDate(row.announcementText);
                            const biddingDate = parseJapaneseDate(row.biddingText) || undefined;
                            if (!announcementDate) continue;

                            let detail: DetailInfo = {
                                status: biddingDate && biddingDate < todayIso ? '受付終了' : '受付中',
                                winningContractor: undefined,
                                skip: false,
                            };

                            if (
                                biddingDate &&
                                biddingDate < todayIso &&
                                biddingDate >= resultLookbackIso &&
                                detailFetchCount < detailFetchLimit
                            ) {
                                detail = await fetchDetailInfo(detailPage, row.kanriNo, detail.status);
                                detailFetchCount += 1;
                            }

                            if (detail.skip) continue;

                            items.set(row.kanriNo, {
                                id: `nara-pref-${row.kanriNo}`,
                                municipality: '奈良県',
                                title: row.title,
                                type: target.type,
                                announcementDate,
                                biddingDate,
                                link: `${PPI_DETAIL_BASE}?kanriNo=${row.kanriNo}&gamenMode=0`,
                                status: detail.status,
                                winningContractor: detail.winningContractor,
                                winnerType: target.type === '建築' ? 'ゼネコン' : '設計事務所',
                            });
                        }
                    } catch (error) {
                        const detail = error instanceof Error ? error.message : String(error);
                        this.recordWarning(`[奈良県] ${target.label} ${gyoushuCode || 'all'} ${fiscalYear} エラー: ${detail}`);
                    }
                    if (deadlineReached) break;
                }
                if (deadlineReached) break;
            }

            const existingNaraItems = loadExistingNaraPrefItems();
            for (const existingItem of existingNaraItems) {
                const kanriNo = extractKanriNoFromItem(existingItem);
                if (!kanriNo || items.has(kanriNo)) continue;
                if (!shouldKeepItem(existingItem.title, existingItem.type)) continue;

                let retainedItem: BiddingItem = { ...existingItem };
                if (
                    existingItem.biddingDate &&
                    existingItem.biddingDate < todayIso &&
                    existingItem.biddingDate >= resultLookbackIso &&
                    detailFetchCount < detailFetchLimit
                ) {
                    const fallbackStatus: BiddingStatus =
                        existingItem.status === '落札' && !existingItem.winningContractor
                            ? '受付終了'
                            : existingItem.status;
                    const detail = await fetchDetailInfo(detailPage, kanriNo, fallbackStatus);
                    detailFetchCount += 1;
                    if (!detail.skip) {
                        retainedItem = {
                            ...retainedItem,
                            status: detail.status,
                            winningContractor: detail.winningContractor || retainedItem.winningContractor,
                        };
                    }
                }

                items.set(kanriNo, retainedItem);
            }
            if (detailFetchCount >= detailFetchLimit) {
                this.recordWarning(`[奈良県] 結果詳細確認が上限 ${detailFetchLimit} 件に到達しました。必要なら NARA_PREF_DETAIL_FETCH_LIMIT を増やしてください。`);
            }
        } catch (error) {
            this.recordError(`[奈良県] スクレイパーエラー: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            await browser.close();
        }

        const unique = Array.from(items.values()).sort((a, b) => b.announcementDate.localeCompare(a.announcementDate));
        console.log(`[奈良県] 合計 ${unique.length} 件`);
        return unique;
    }
}

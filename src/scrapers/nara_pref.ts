import { chromium, Frame, Page } from 'playwright';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

const PPI_SEARCH_URL = 'https://ppi.ebid-kouji-gyoumu.pref.nara.jp/DENCHO/PPJ/PPJ0050_0010/';
const PPI_DETAIL_BASE = 'https://ppi.ebid-kouji-gyoumu.pref.nara.jp/DENCHO/PPJ/PPC0050_0020/';

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
    status: '受付中' | '落札';
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

async function fetchDetailInfo(page: Page, kanriNo: string): Promise<DetailInfo> {
    const detailUrl = `${PPI_DETAIL_BASE}?kanriNo=${kanriNo}&gamenMode=0`;
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(800);

    return await page.evaluate(() => {
        const text = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
        const isCanceled = text.includes('【中止】') || text.includes('中止となりました');

        const winnerMatch = text.match(/落札者\s+([^\n\r\t ](?:.*?))(?:\s+落札金額（税抜）|\s+予定価格（税抜）|\s+最低制限／調査基準価格（税抜）|$)/);
        const winningContractor = winnerMatch?.[1]?.trim() || undefined;
        const hasResult = text.includes('落札結果') && text.includes('落札');

        return {
            status: hasResult ? '落札' : '受付中',
            winningContractor,
            skip: isCanceled,
        };
    });
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
            const detailCutoff = new Date();
            detailCutoff.setDate(detailCutoff.getDate() - 21);
            const detailCutoffIso = detailCutoff.toISOString().slice(0, 10);
            let detailFetchCount = 0;
            const detailFetchLimit = 12;
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
                                status: biddingDate && biddingDate < todayIso ? '落札' : '受付中',
                                winningContractor: undefined,
                                skip: false,
                            };

                            if (
                                biddingDate &&
                                biddingDate < todayIso &&
                                biddingDate >= detailCutoffIso &&
                                detailFetchCount < detailFetchLimit
                            ) {
                                detail = await fetchDetailInfo(detailPage, row.kanriNo);
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

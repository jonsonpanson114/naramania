import crypto from 'crypto';
import { chromium } from 'playwright';
import type { Browser, Frame, Page } from 'playwright';
import type { BiddingItem, BiddingType, Municipality } from '../../types/bidding';
import { classifyWinner } from './filter';
import { getFiscalYearStart } from './fiscal_year';

/**
 * 入札情報公開サービス(EPI Cloud / epi-cloud.fwd.ne.jp)の共通スクレイパー。
 *
 * EPI は「発注情報の検索」(＝公告・入札予定)と「入札・契約結果情報」(＝開札結果)の
 * 2つのメニューを持つが、自治体ごとにコピペで実装していたため、片方のメニューしか
 * 見ていない自治体が複数あった(香芝市=結果のみ、大和高田市・桜井市=EPI未使用)。
 * 公告を見ていなければ「入札に参加できるうちに気づく」ことができず、
 * 結果を見ていなければ「誰が取ったか」が分からない。どちらも欠けてはいけないので、
 * 両メニューを必ず巡回する共通実装をここに1本化する。
 */

export const EPI_BASE = 'https://www.epi-cloud.fwd.ne.jp';

export type EpiScrapeOptions = {
    municipality: Municipality;
    /** id の接頭辞（例: 'yamato-takada'）*/
    idPrefix: string;
    /**
     * 入口URL。自治体によって KF001ShowAction 形式と logon 形式があり、
     * どちらが生きているかはサイト側の都合で変わるため複数指定して順に試す。
     */
    entryUrls: string[];
    /** 業務区分。設計業務は「コンサル」区分にしか出ないため既定で両方見る */
    categories?: string[];
    /** 対象年度。既定は当年度と前年度 */
    nendos?: string[];
    /** 発注情報(公告)を取得するか */
    includeAnnouncements?: boolean;
    /** 入札・契約結果を取得するか */
    includeResults?: boolean;
    /** 全体のタイムアウト(ms) */
    timeoutMs?: number;
};

export type EpiScrapeOutcome = {
    items: BiddingItem[];
    warnings: string[];
};

export function defaultEpiNendos(referenceDate = new Date()): string[] {
    const current = getFiscalYearStart(referenceDate);
    return [String(current), String(current - 1)];
}

function parseEpiDate(text: string): string {
    const western = text.match(/(\d{4})[/\-年](\d{1,2})[/\-月](\d{1,2})/);
    if (western) {
        return `${western[1]}-${western[2].padStart(2, '0')}-${western[3].padStart(2, '0')}`;
    }

    const reiwa = text.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (reiwa) {
        const year = 2018 + parseInt(reiwa[1], 10);
        return `${year}-${reiwa[2].padStart(2, '0')}-${reiwa[3].padStart(2, '0')}`;
    }

    return '';
}

function classifyEpiType(title: string, gyoshu = ''): BiddingType {
    const target = `${title} ${gyoshu}`;
    if (/(設計|測量|コンサル|監理|調査)/.test(target)) return 'コンサル';
    if (/(委託|業務)/.test(target)) return '委託';
    return '建築';
}

function toAbsoluteUrl(href: string, fallback: string): string {
    if (!href) return fallback;
    if (href.startsWith('javascript:')) return fallback;
    return href.startsWith('http') ? href : `${EPI_BASE}${href}`;
}

function hashId(prefix: string, seed: string): string {
    return `${prefix}-${crypto.createHash('md5').update(seed).digest('hex').slice(0, 10)}`;
}

async function getRightFrame(page: Page): Promise<Frame | null> {
    for (let i = 0; i < 20; i += 1) {
        const frame = page.frames().find(candidate => candidate.name() === 'frmRIGHT');
        if (frame) return frame;
        await page.waitForTimeout(500);
    }
    return null;
}

/**
 * 検索結果の実データは frmRIGHT の中にネストされた name="right" の iframe にしかない。
 * frmRIGHT 自体もURLパターンにマッチしてしまうため、name="right" を必ず優先する。
 * (香芝市で「常に0件」になっていた原因がこれ)
 */
async function getDataFrame(page: Page): Promise<Frame | null> {
    for (let i = 0; i < 20; i += 1) {
        const namedFrame = page.frames().find(candidate => candidate.name() === 'right');
        if (namedFrame) return namedFrame;
        const patternFrame = page.frames().find(candidate => /KF[CK][34]01FrameShow/.test(candidate.url()));
        if (patternFrame) return patternFrame;
        await page.waitForTimeout(500);
    }
    return null;
}

/** 入口URLを順に試し、業務区分メニューが出た画面を開く */
async function openCategory(page: Page, entryUrls: string[], categoryLabel: string): Promise<string | null> {
    for (const entryUrl of entryUrls) {
        try {
            await page.goto(entryUrl, { waitUntil: 'load', timeout: 45000 });
            await page.waitForTimeout(2000);

            const bodyText = ((await page.locator('body').innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
            if (bodyText.includes('サービス停止中') && bodyText.includes('情報公開')) {
                return null;
            }

            const category = page.locator('span.ATYPE').filter({ hasText: categoryLabel }).first();
            if (await category.count() === 0) continue;

            await category.click({ force: true, timeout: 30000 });
            await page.waitForTimeout(3000);
            return entryUrl;
        } catch {
            // 次の入口URLへ
        }
    }
    return null;
}

async function clickRightMenu(page: Page, label: string): Promise<Frame | null> {
    const rightFrame = await getRightFrame(page);
    if (!rightFrame) return null;

    const menu = rightFrame.locator('span.ATYPE').filter({ hasText: label }).first();
    if (await menu.count() === 0) return null;

    await menu.click({ force: true, timeout: 30000 });
    await page.waitForTimeout(3000);
    return getRightFrame(page);
}

async function selectNendoAndSearch(frame: Frame, nendo: string): Promise<boolean> {
    const nendoOption = frame.locator(`select[name="nendo"] option[value="${nendo}"]`);
    if (await nendoOption.count() === 0) return false;

    await frame.selectOption('select[name="nendo"]', nendo);
    const perPage = frame.locator('select[name="perPage"], select[name="A300"]');
    if (await perPage.count() > 0) {
        await perPage.first().selectOption('100').catch(() => undefined);
    }
    await frame.locator('input[type="button"][value="検索"]').first().click({ force: true, timeout: 30000 });
    return true;
}

async function rowTexts(row: ReturnType<Frame['locator']>): Promise<string[]> {
    const cells = await row.locator('td').all();
    return Promise.all(
        cells.map(async cell => ((await cell.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()),
    );
}

/** 発注情報(公告)一覧の行を BiddingItem に変換する */
async function extractAnnouncementRows(
    frame: Frame,
    options: EpiScrapeOptions,
    fallbackLink: string,
): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];
    const rows = await frame.locator('table tr').all().catch(() => []);

    for (const row of rows) {
        const link = row.locator('a').first();
        if (await link.count() === 0) continue;

        const title = ((await link.textContent()) || '').replace(/\s+/g, ' ').trim();
        if (!title || title.length < 5) continue;

        const cellTexts = await rowTexts(row);
        const rowText = cellTexts.join(' ');
        const dates = Array.from(new Set(rowText.match(/\d{4}\/\d{1,2}\/\d{1,2}/g) || []))
            .map(parseEpiDate)
            .filter(Boolean)
            .sort();
        const gyoshu = cellTexts.find(text => /(建築|電気|管|機械|防水|解体|設計|測量|コンサル|監理|調査)/.test(text)) || '';
        const href = await link.getAttribute('href').catch(() => null);
        const fullLink = toAbsoluteUrl(href || '', fallbackLink);
        const announcementDate = dates[0] || '';
        if (!announcementDate) continue;

        items.push({
            id: hashId(`${options.idPrefix}-epi`, `${title}|${fullLink}|${announcementDate}`),
            municipality: options.municipality,
            title,
            type: classifyEpiType(title, gyoshu),
            announcementDate,
            biddingDate: dates[1],
            link: fullLink,
            status: '受付中',
        });
    }

    return items;
}

/** 入札・契約結果一覧の行を BiddingItem に変換する */
async function extractResultRows(
    frame: Frame,
    options: EpiScrapeOptions,
    fallbackLink: string,
): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];
    const rows = await frame.locator('table tr').all().catch(() => []);

    for (const row of rows) {
        const cellTexts = await rowTexts(row);
        // col: 0=結果種別 1=公開日 2=工事名/業務名 3=契約管理番号 4=入札方式 5=落札者 6=金額 7=課所名
        if (cellTexts.length < 7) continue;

        const title = cellTexts[2];
        if (!title) continue;

        const publishedDate = parseEpiDate(cellTexts[1]);
        if (!publishedDate) continue;

        const contractNo = cellTexts[3].replace(/\s+/g, '');
        const rawWinner = cellTexts[5];
        const winner = rawWinner && rawWinner !== '-' ? rawWinner : '';
        // 金額セルは document.write() のスクリプトソースが混ざるので末尾の金額だけ拾う。
        // 落札者が"-"の行はここに「取止め・不調」が入る。
        const amountText = cellTexts[6];
        const isFailed = !winner && /取止め|不調/.test(amountText);
        const amountMatch = amountText.match(/([\d,]+)\s*円\s*$/);
        const parsedAmount = amountMatch ? parseInt(amountMatch[1].replace(/,/g, ''), 10) : Number.NaN;

        const href = await row.locator('a').first().getAttribute('href').catch(() => null);
        const controlNo = href?.match(/doEdit0\d0\('([^']+)'\)/)?.[1];
        const detailUrl = controlNo
            ? `${EPI_BASE}/koukai/do/KK402ShowAction?control_no=${controlNo}`
            : toAbsoluteUrl(href || '', fallbackLink);

        items.push({
            id: contractNo
                ? `${options.idPrefix}-epi-result-${contractNo}`
                : hashId(`${options.idPrefix}-epi-result`, `${title}|${publishedDate}`),
            municipality: options.municipality,
            title,
            type: classifyEpiType(title),
            announcementDate: publishedDate,
            biddingDate: publishedDate,
            link: detailUrl,
            status: isFailed ? '不調' : winner ? '落札' : '受付終了',
            winningContractor: isFailed ? undefined : winner || undefined,
            winnerType: classifyWinner(winner),
            estimatedPrice: Number.isFinite(parsedAmount) ? `${parsedAmount.toLocaleString()}円` : undefined,
        });
    }

    return items;
}

async function collectPaged(
    page: Page,
    extract: (frame: Frame) => Promise<BiddingItem[]>,
    onItems: (items: BiddingItem[]) => void,
): Promise<void> {
    const MAX_PAGES = 30;

    for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo += 1) {
        const dataFrame = await getDataFrame(page);
        if (!dataFrame) return;

        onItems(await extract(dataFrame));

        // 「次へ」はデータフレーム側にある自治体と、外側の frmRIGHT 側にしかない
        // 自治体の両方がある。片方しか見ていないと2ページ目以降が丸ごと落ちる。
        const outerFrame = await getRightFrame(page);
        const candidates = [dataFrame, outerFrame].filter((frame): frame is Frame => Boolean(frame));
        let nextClicked = false;
        for (const frame of candidates) {
            const nextLink = frame.locator('a').filter({ hasText: '次へ' }).first();
            if (await nextLink.count() === 0) continue;
            await nextLink.click({ force: true, timeout: 15000 }).catch(() => undefined);
            await page.waitForTimeout(2500);
            nextClicked = true;
            break;
        }
        if (!nextClicked) return;
    }
}

async function scrapeWithBrowser(options: EpiScrapeOptions, browser: Browser): Promise<EpiScrapeOutcome> {
    const warnings: string[] = [];
    const itemsById = new Map<string, BiddingItem>();
    const categories = options.categories ?? ['工事', 'コンサル'];
    const nendos = options.nendos ?? defaultEpiNendos();
    const includeAnnouncements = options.includeAnnouncements ?? true;
    const includeResults = options.includeResults ?? true;
    const fallbackLink = options.entryUrls[0];

    const page = await browser.newPage();
    page.setDefaultTimeout(120000);

    const collect = (items: BiddingItem[]) => {
        for (const item of items) {
            const existing = itemsById.get(item.id);
            if (!existing) {
                itemsById.set(item.id, item);
                continue;
            }
            if (item.winningContractor && !existing.winningContractor) {
                existing.winningContractor = item.winningContractor;
                existing.winnerType = item.winnerType;
            }
            if (item.status === '落札' || item.status === '不調') existing.status = item.status;
        }
    };

    const menus: { label: string; extract: (frame: Frame) => Promise<BiddingItem[]> }[] = [];
    if (includeAnnouncements) {
        menus.push({
            label: '発注情報の検索',
            extract: frame => extractAnnouncementRows(frame, options, fallbackLink),
        });
    }
    if (includeResults) {
        menus.push({
            label: '入札・契約結果情報',
            extract: frame => extractResultRows(frame, options, fallbackLink),
        });
    }

    for (const categoryLabel of categories) {
        for (const menu of menus) {
            const opened = await openCategory(page, options.entryUrls, categoryLabel);
            if (!opened) {
                warnings.push(`[${options.municipality}] EPI 業務区分「${categoryLabel}」を開けませんでした`);
                continue;
            }

            const menuFrame = await clickRightMenu(page, menu.label);
            if (!menuFrame) {
                warnings.push(`[${options.municipality}] EPI「${menu.label}」メニューが見つかりません(${categoryLabel})`);
                continue;
            }

            for (const nendo of nendos) {
                try {
                    const searched = await selectNendoAndSearch(menuFrame, nendo);
                    if (!searched) continue;
                    await page.waitForTimeout(3000);
                    const before = itemsById.size;
                    await collectPaged(page, menu.extract, collect);
                    console.log(`[${options.municipality}] EPI ${categoryLabel}/${menu.label}/${nendo}年度: ${itemsById.size - before}件`);
                } catch (error) {
                    warnings.push(
                        `[${options.municipality}] EPI ${categoryLabel}/${menu.label}/${nendo}年度 検索エラー: ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            }
        }
    }

    return { items: Array.from(itemsById.values()), warnings };
}

/**
 * EPI から発注情報(公告)と入札・契約結果の両方を取得する。
 * 失敗しても呼び出し側の他ソースを巻き添えにしないよう、例外は投げず warnings で返す。
 */
export async function scrapeEpiCloud(options: EpiScrapeOptions): Promise<EpiScrapeOutcome> {
    const timeoutMs = options.timeoutMs ?? 240000;
    let browser: Browser | null = null;

    try {
        browser = await chromium.launch({ headless: true });
        const activeBrowser = browser;
        return await Promise.race([
            scrapeWithBrowser(options, activeBrowser),
            new Promise<EpiScrapeOutcome>((_, reject) => {
                setTimeout(() => reject(new Error(`EPI timeout (${timeoutMs}ms)`)), timeoutMs);
            }),
        ]);
    } catch (error) {
        return {
            items: [],
            warnings: [`[${options.municipality}] EPI取得をスキップ: ${error instanceof Error ? error.message : String(error)}`],
        };
    } finally {
        await browser?.close().catch(() => undefined);
    }
}

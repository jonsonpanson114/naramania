import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, Scraper, BiddingType, Municipality } from '../types/bidding';
import { classifyWinner } from './common/filter';

const TAKATORI_BASE_URL = 'https://www.town.takatori.nara.jp';
const TAKATORI_RESULT_URL = `${TAKATORI_BASE_URL}/contents_detail.php?frmId=2205`;
// 入札情報カテゴリ。結果ページ(frmId=2205)だけを見ていたため、
// 高取町は24件すべてが開札済みで、応札できる公告が1件も入っていなかった。
// カテゴリ一覧から公告側の詳細ページも都度解決する。
const TAKATORI_CATEGORY_URL = `${TAKATORI_BASE_URL}/contents_detail.php?co=cat&frmId=2683&frmCd=2-6-0-0-0`;
const TAKATORI_HEADERS = { 'User-Agent': 'Mozilla/5.0' };
const TAKATORI_NON_ITEM_TITLE = /^(?:こちら|一覧|トップ|ホーム|前へ|次へ|戻る|PDF|ダウンロード|お問い合わせ|このページ|サイトマップ)/;
const IKARUGA_INDEX_URL = 'https://www.town.ikaruga.nara.jp/category/1-10-0-0-0-0-0-0-0-0.html';
const IKARUGA_BASE_URL = 'https://www.town.ikaruga.nara.jp';
const KNOWN_IKARUGA_ITEMS: BiddingItem[] = [
    {
        id: buildId('斑鳩町', '2026-01-08', '町営興留東団地住宅解体工事'),
        municipality: '斑鳩町',
        title: '町営興留東団地住宅解体工事',
        type: '建築',
        announcementDate: '2026-01-08',
        biddingDate: '2026-01-30',
        link: 'https://www.town.ikaruga.nara.jp/category/1-10-0-0-0-0-0-0-0-0.html',
        status: '受付終了',
    },
    {
        id: buildId('斑鳩町', '2026-05-01', '斑鳩小学校の長寿命化工事に向けた基本計画'),
        municipality: '斑鳩町',
        title: '斑鳩小学校の長寿命化工事に向けた基本計画',
        type: 'コンサル',
        announcementDate: '2026-05-01',
        link: 'https://www.town.ikaruga.nara.jp/cmsfiles/contents/0000000/234/R8-5-1.pdf',
        status: '受付中',
    },
];
function classifyType(title: string): BiddingType {
    if (title.includes('設計') || title.includes('監理') || title.includes('コンサル')) return 'コンサル';
    if (title.includes('委託') || title.includes('業務')) return '委託';
    return '建築';
}

function parseJapaneseDate(text: string): string {
    const reiwa = text.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (reiwa) {
        const year = 2018 + Number(reiwa[1]);
        return `${year}-${String(Number(reiwa[2])).padStart(2, '0')}-${String(Number(reiwa[3])).padStart(2, '0')}`;
    }
    const western = text.match(/(20\d{2})\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (western) {
        return `${western[1]}-${String(Number(western[2])).padStart(2, '0')}-${String(Number(western[3])).padStart(2, '0')}`;
    }
    return '';
}

function parseIkarugaBiddingDate(title: string, pageDate: string): string {
    const match = title.match(/【(\d{1,2})月(\d{1,2})日入札分】/);
    if (!match || !pageDate) return '';
    const year = pageDate.slice(0, 4);
    return `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
}

function makeAbsoluteUrl(baseUrl: string, href?: string | null): string {
    if (!href) return baseUrl;
    if (href.startsWith('http')) return href;
    if (href.startsWith('/')) return `${IKARUGA_BASE_URL}${href}`;
    return new URL(href, `${baseUrl.replace(/[^/]+$/, '')}`).toString();
}

function buildId(municipality: Municipality, date: string, title: string): string {
    return `${municipality}-${date || 'undated'}-${title}`
        .normalize('NFKC')
        .replace(/[^\w\u3040-\u30ff\u3400-\u9fff-]+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 120);
}

function toTakatoriAbsoluteUrl(href: string): string {
    if (!href) return '';
    if (href.startsWith('http')) return href;
    if (href.startsWith('//')) return `https:${href}`;
    if (href.startsWith('/')) return `${TAKATORI_BASE_URL}${href}`;
    return `${TAKATORI_BASE_URL}/${href.replace(/^\.\//, '')}`;
}

/** 入札情報カテゴリから詳細ページ(公告・結果)のURLを解決する */
async function resolveTakatoriDetailPages(): Promise<{ url: string; label: string }[]> {
    const pages = new Map<string, string>();

    try {
        const res = await axios.get(TAKATORI_CATEGORY_URL, { headers: TAKATORI_HEADERS, timeout: 20000 });
        const $ = cheerio.load(res.data);

        $('a[href]').each((_, el) => {
            const label = $(el).text().replace(/\s+/g, ' ').trim();
            const href = toTakatoriAbsoluteUrl($(el).attr('href') || '');
            if (!label || !href) return;
            if (!/contents_detail\.php/.test(href)) return;
            if (/co=cat/.test(href)) return; // カテゴリ一覧そのものは除外
            if (!/(入札|公告|見積|開札|落札|プロポーザル|指名|契約)/.test(label)) return;
            pages.set(href, label);
        });
    } catch (error) {
        console.warn('[高取町] カテゴリ解決エラー:', error instanceof Error ? error.message : String(error));
    }

    return Array.from(pages.entries()).map(([url, label]) => ({ url, label }));
}

/** 公告側の詳細ページから受付中案件を拾う（添付PDF一覧構成を想定） */
async function scrapeTakatoriAnnouncementPage(url: string, label: string): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];

    try {
        const res = await axios.get(url, { headers: TAKATORI_HEADERS, timeout: 20000 });
        const $ = cheerio.load(res.data);
        const pageDate = parseJapaneseDate($('body').text());

        $('a[href]').each((_, el) => {
            const rawTitle = $(el).text().replace(/\s+/g, ' ').trim();
            const href = toTakatoriAbsoluteUrl($(el).attr('href') || '');
            if (!rawTitle || !href) return;
            if (!/\.(pdf|docx?|xlsx?)(?:$|\?)/i.test(href)) return;

            const title = rawTitle
                .replace(/\((?:PDF|Word|Excel)[^)]*\)/gi, '')
                .replace(/\[[^\]]*\]/g, '')
                .trim();
            if (title.length < 6 || TAKATORI_NON_ITEM_TITLE.test(title)) return;

            const date = parseJapaneseDate(rawTitle) || pageDate;
            const id = buildId('高取町', date, title);
            if (items.some(existing => existing.id === id)) return;

            items.push({
                id,
                municipality: '高取町',
                title,
                type: classifyType(title),
                announcementDate: date,
                link: url,
                pdfUrl: /\.pdf(?:$|\?)/i.test(href) ? href : undefined,
                status: '受付中',
            });
        });
    } catch (error) {
        console.warn(`[高取町] 公告ページ取得エラー(${label}):`, error instanceof Error ? error.message : String(error));
    }

    return items;
}

async function scrapeTakatoriResults(resultUrl: string = TAKATORI_RESULT_URL): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];

    try {
        const res = await axios.get(resultUrl, {
            headers: TAKATORI_HEADERS,
            timeout: 20000,
        });
        const $ = cheerio.load(res.data);

        // 4列以上のテーブルを無条件に結果表として読むと、公告ページの案件一覧
        // (案件名|場所|工期|入札日 等)まで「落札」として取り込んでしまう。
        // 落札者列を持つページだけを結果表として扱う。
        const looksLikeResultTable = $('table').toArray().some(table =>
            /(落札者|落札業者|落札金額|落札額)/.test($(table).text()),
        );
        if (!looksLikeResultTable) return items;

        let sectionDate = '';

        $('h3, h4, tr').each((_, el) => {
            const tagName = el.tagName?.toLowerCase() || '';
            const text = $(el).text().replace(/\s+/g, ' ').trim();

            if ((tagName === 'h3' || tagName === 'h4') && text.includes('令和')) {
                sectionDate = parseJapaneseDate(text) || sectionDate;
                return;
            }

            if (tagName !== 'tr') return;
            const cells = $(el).find('td');
            if (cells.length < 4) return;

            const title = $(cells[0]).text().replace(/\s+/g, ' ').trim();
            const winner = $(cells[2]).text().replace(/\s+/g, ' ').trim();
            const amount = $(cells[3]).text().replace(/\s+/g, ' ').trim();
            if (!title || title === '業務名') return;

            const status = amount.includes('不調') || amount.includes('不成立') ? '不調' : '落札';
            const winningContractor = status === '落札' && winner && winner !== '-' ? winner : undefined;

            items.push({
                id: buildId('高取町', sectionDate, title),
                municipality: '高取町',
                title,
                type: classifyType(title),
                announcementDate: sectionDate,
                biddingDate: sectionDate || undefined,
                link: resultUrl,
                status,
                winningContractor,
                winnerType: classifyWinner(winningContractor || ''),
            });
        });
    } catch (e: unknown) {
        console.warn('[高取町] 結果取得エラー:', e instanceof Error ? e.message : String(e));
    }

    return items;
}

async function scrapeIkarugaAnnouncements(): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];

    try {
        const res = await axios.get(IKARUGA_INDEX_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 20000,
        });
        const $ = cheerio.load(res.data);
        const detailLinks = new Set<string>();

        $('a').each((_, el) => {
            const title = $(el).text().replace(/\s+/g, ' ').trim();
            if (!title) return;
            if (!title.includes('入札') && !title.includes('閲覧図書')) return;
            const href = $(el).attr('href');
            if (!href) return;
            detailLinks.add(makeAbsoluteUrl(IKARUGA_INDEX_URL, href));
        });

        for (const detailUrl of detailLinks) {
            const detailRes = await axios.get(detailUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 20000,
            });
            const $$ = cheerio.load(detailRes.data);
            const pageDate = parseJapaneseDate($$.text());

            $$('tr').each((_, tr) => {
                const cells = $$(tr).find('td');
                if (cells.length < 2) return;
                const title = $$(cells[1]).text().replace(/\s+/g, ' ').trim() || $$(cells[0]).text().replace(/\s+/g, ' ').trim();
                if (!title || title === '工事名' || title === '業務名') return;
                const pageTitle = $$('.pageTitle, h1').first().text().replace(/\s+/g, ' ').trim() || $$('body').text();
                const biddingDate = parseIkarugaBiddingDate(pageTitle, pageDate);

                items.push({
                    id: buildId('斑鳩町', pageDate, title),
                    municipality: '斑鳩町',
                    title,
                    type: classifyType(title),
                    announcementDate: pageDate,
                    biddingDate: biddingDate || undefined,
                    link: detailUrl,
                    status: '受付中',
                });
            });
        }
    } catch (e: unknown) {
        console.warn('[斑鳩町] 公告取得エラー:', e instanceof Error ? e.message : String(e));
    }

    return items;
}

export class TakatoriTownScraper implements Scraper {
    municipality: '高取町' = '高取町' as const;

    async scrape(): Promise<BiddingItem[]> {
        const items = await scrapeTakatoriResults();

        const detailPages = await resolveTakatoriDetailPages();
        console.log(`[高取町] 入札情報カテゴリ: 詳細ページ ${detailPages.length}件を解決`);

        for (const page of detailPages) {
            if (page.url === TAKATORI_RESULT_URL) continue;

            // 落札者列を持つページだけ結果表として解析し、それ以外は公告として添付PDFを拾う
            const resultItems = await scrapeTakatoriResults(page.url);
            const candidates = resultItems.length > 0
                ? resultItems
                : await scrapeTakatoriAnnouncementPage(page.url, page.label);

            for (const candidate of candidates) {
                if (items.some(existing => existing.title === candidate.title)) continue;
                items.push(candidate);
            }
            console.log(`[高取町] ${page.label}: ${candidates.length}件`);
        }

        console.log(`[高取町] 合計 ${items.length} 件`);
        return items;
    }
}

export class IkarugaTownScraper implements Scraper {
    municipality: '斑鳩町' = '斑鳩町' as const;

    async scrape(): Promise<BiddingItem[]> {
        const items = await scrapeIkarugaAnnouncements();
        for (const knownItem of KNOWN_IKARUGA_ITEMS) {
            if (!items.some(item => item.title === knownItem.title)) {
                items.push(knownItem);
            }
        }
        console.log(`[斑鳩町] 合計 ${items.length} 件`);
        return items;
    }
}

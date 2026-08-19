import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
import { fetchHtml, fetchJson } from './common/html_fetch';
import { getCurrentReiwaFiscalYear, fiscalMonthToCalendarYear } from './common/fiscal_year';

// 大和郡山市 入札情報（SMART CMS JSON API 経由）
const BASE = 'https://www.city.yamatokoriyama.lg.jp';
// このJSONツリーは「入札のお知らせ」という一般調達(車両賃貸借・図書館機器購入等)の
// お知らせ欄で、建築・土木の入札結果はほぼ載っていない。建設工事等の結果は別途
// 「建設工事・建設工事に係る業務委託等入札の結果」という専用ページ(下記
// KENSETSU_KEKKA_INDEX から年度別に解決)に一覧表で載っている。
const RESULT_JSON   = `${BASE}/shigoto_sangyo/nyusatsu_keiyaku/nyusatsunooshirase/index.tree.json`;
const ANNOUNCE_JSON = `${BASE}/shigoto_sangyo/nyusatsu_keiyaku/nyusatsu/index.tree.json`;
const CURRENT_ANNOUNCE_PAGE = `${BASE}/soshiki/nyusatsukensaka/nyusatsu_keiyaku/2/9328.html`;
const KENSETSU_KEKKA_INDEX = `${BASE}/soshiki/nyusatsukensaka/nyusatsu_keiyaku/2/index.html`;
const KNOWN_CURRENT_ITEMS: Array<Pick<BiddingItem, 'title' | 'announcementDate' | 'biddingDate' | 'link' | 'pdfUrl' | 'type' | 'status'>> = [
    {
        title: '市立郡山南小学校廊下改修工事（2期）',
        announcementDate: '2026-05-26',
        biddingDate: '2026-06-17',
        link: CURRENT_ANNOUNCE_PAGE,
        pdfUrl: 'https://www.city.yamatokoriyama.lg.jp/material/files/group/26/nk260617_06k.pdf',
        type: '建築',
        status: '受付中',
    },
];
const KNOWN_RESULT_ITEMS: Array<Pick<BiddingItem, 'title' | 'announcementDate' | 'biddingDate' | 'link' | 'type' | 'status' | 'winningContractor'>> = [
    {
        title: '旧平和保育園解体整備事業実施設計業務委託',
        announcementDate: '2024-06-26',
        biddingDate: '2024-06-26',
        link: 'https://www.city.yamatokoriyama.lg.jp/shigoto_sangyo/nyusatsu_keiyaku/kensetsu/6247.html',
        type: 'コンサル',
        status: '落札',
        winningContractor: '有限会社 創和建築事務所',
    },
    {
        title: '西田中町共同浴場解体工事設計委託業務',
        announcementDate: '2024-07-31',
        biddingDate: '2024-07-31',
        link: 'https://www.city.yamatokoriyama.lg.jp/shigoto_sangyo/nyusatsu_keiyaku/kensetsu/6247.html',
        type: 'コンサル',
        status: '不調',
    },
    {
        title: '大和郡山市消防団第三分団庫建設工事に伴う監理業務委託',
        announcementDate: '2025-06-04',
        biddingDate: '2025-06-04',
        link: 'https://www.city.yamatokoriyama.lg.jp/soshiki/nyusatsukensaka/nyusatsu_keiyaku/2/1893.html',
        type: 'コンサル',
        status: '落札',
        winningContractor: 'YARD吉村建築設計',
    },
];

// タイトルに含まれていればスキップ（土木系・非建築）
const SKIP_TITLE_KEYWORDS = [
    '車両', '物品', '清掃', '警備', '廃棄', 'システム', '役務', '電力供給',
    '下水道', '管渠', '舗装', '土木', '河川', '造園', '電気通信', '水道施設',
    '農業', '交通安全施設', '道路維持', '橋梁', '浄水', '井戸',
];

function classifyType(title: string): BiddingType {
    if (title.includes('設計') || title.includes('測量') || title.includes('コンサル') || title.includes('地質')) return 'コンサル';
    if (title.includes('委託') || title.includes('業務')) return '委託';
    return '建築';
}

function makeId(title: string, suffix: string = ''): string {
    return `yamato-koriyama-${crypto.createHash('md5').update(title + suffix).digest('hex').slice(0, 8)}`;
}

function parseDate(text: string, yearHint?: string): string {
    const m = text.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (m) {
        const year = 2018 + parseInt(m[1]);
        return `${year}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }
    const m2 = text.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (m2) return `${m2[1]}-${m2[2].padStart(2, '0')}-${m2[3].padStart(2, '0')}`;
    const m3 = text.match(/(\d{1,2})月(\d{1,2})日/);
    if (m3 && yearHint) return `${yearHint}-${m3[1].padStart(2, '0')}-${m3[2].padStart(2, '0')}`;
    return '';
}

interface CmsPage {
    page_name: string;
    url: string;
    publish_datetime: string;
    is_category_index: boolean;
    child_pages?: CmsPage[];
    child_pages_count?: number;
}

async function fetchChildPages(jsonUrl: string, yearPattern: RegExp): Promise<CmsPage[]> {
    const pages = await fetchJson<CmsPage[]>(jsonUrl, 15000);
    const matchingCategories = pages.filter(p => p.is_category_index && yearPattern.test(p.page_name));
    const childPages = matchingCategories.flatMap(category => category.child_pages || []);
    if (childPages.length > 0) return childPages;
    // フォールバック: child_pages_count最大のもの
    const sorted = [...pages].sort((a, b) => (b.child_pages_count || 0) - (a.child_pages_count || 0));
    return sorted[0]?.child_pages || [];
}

async function scrapeDetailPage(url: string): Promise<{
    biddingDate?: string;
    contractor?: string;
    tableItems?: Array<{ title: string; type: string; contractor: string; biddingDate: string }>;
}>;
async function scrapeDetailPage(url: string, yearHint: string): Promise<{
    biddingDate?: string;
    contractor?: string;
    tableItems?: Array<{ title: string; type: string; contractor: string; biddingDate: string }>;
}>;
async function scrapeDetailPage(url: string, yearHint?: string): Promise<{
    biddingDate?: string;
    contractor?: string;
    tableItems?: Array<{ title: string; type: string; contractor: string; biddingDate: string }>;
}> {
    try {
        const html = await fetchHtml(url, 20000);
        const $ = cheerio.load(html);
        const bodyText = $('body').text();

        // 開札日
        const bm = bodyText.match(/開札日[：:]\s*([^\n]+)/);
        const biddingDate = bm ? parseDate(bm[1], yearHint) : undefined;

        // テーブルから落札者・複数件名を探す
        const tableItems: Array<{ title: string; type: string; contractor: string; biddingDate: string }> = [];
        const keyValuePairs = new Map<string, string>();

        $('table').each((_, tbl) => {
            const rows = $(tbl).find('tr').toArray();
            if (rows.length < 2) return;

            if (rows.every(row => $(row).find('td').length === 2)) {
                rows.forEach(row => {
                    const cells = $(row).find('td').map((_, c) => $(c).text().trim()).toArray();
                    const key = cells[0]?.replace(/\s+/g, '');
                    const value = cells[1]?.trim();
                    if (key && value) keyValuePairs.set(key, value);
                });
            }

            const headerCells = $(rows[0]).find('th, td').map((_, c) => $(c).text().trim()).toArray();
            const titleIdx = headerCells.findIndex(h => h.includes('件名') || h.includes('業務名') || h.includes('工事名'));
            const typeIdx  = headerCells.findIndex(h => h.includes('種別') || h.includes('業種'));
            const contractorIdx = headerCells.findIndex(h => h.includes('落札'));
            const biddingDateIdx = headerCells.findIndex(h => h.includes('開札'));

            if (titleIdx < 0) return;

            for (let i = 1; i < rows.length; i++) {
                const cells = $(rows[i]).find('td').map((_, c) => $(c).text().trim()).toArray();
                if (cells.length <= titleIdx) continue;
                const title = cells[titleIdx]?.trim();
                // 4文字以下は「入札方法」「開札結果」「落札金額」等のメタデータラベルなので除外
                if (!title || title.length < 6 || title === '件名' || title === '業務名') continue;

                const type = typeIdx >= 0 ? (cells[typeIdx] || '') : '';
                const contractor = contractorIdx >= 0 ? (cells[contractorIdx] || '') : '';
                const bd = biddingDateIdx >= 0 ? parseDate(cells[biddingDateIdx] || '', yearHint) : '';

                tableItems.push({ title, type, contractor, biddingDate: bd });
            }
        });

        // 落札者（テーブルなしの場合）
        const cm = bodyText.match(/落札(?:者|業者)[：:\s]\s*([^\n\r]+)/);
        const contractor = keyValuePairs.get('落札者') || keyValuePairs.get('落札業者') || (cm ? cm[1].trim() : undefined);
        const fallbackBiddingDate = keyValuePairs.get('開札日') ? parseDate(keyValuePairs.get('開札日') || '', yearHint) : undefined;

        return { biddingDate: biddingDate || fallbackBiddingDate, contractor, tableItems };
    } catch {
        return {};
    }
}

async function scrapeCurrentAnnouncementPage(): Promise<BiddingItem[]> {
    try {
        const html = await fetchHtml(CURRENT_ANNOUNCE_PAGE, 20000);
        const $ = cheerio.load(html);
        const items: BiddingItem[] = [];
        const pageYear = String(new Date().getFullYear());

        $('table tr').each((_, row) => {
            const cells = $(row).find('td');
            if (cells.length < 6) return;

            const announcementText = $(cells[0]).text().trim();
            const biddingText = $(cells[1]).text().trim();
            const titleCell = $(cells[2]);
            const title = titleCell.text().replace(/\(PDFファイル:[^)]+\)/g, '').replace(/\s+/g, ' ').trim();
            const typeText = $(cells[5]).text().trim();

            if (!title || title === '該当なし') return;

            const pdfHref = titleCell.find('a').first().attr('href') || '';
            const pdfUrl = pdfHref
                ? (pdfHref.startsWith('http') ? pdfHref : new URL(pdfHref, CURRENT_ANNOUNCE_PAGE).toString())
                : undefined;

            const announcementDate = parseDate(announcementText, pageYear);
            const biddingDate = parseDate(biddingText, pageYear) || undefined;
            if (!announcementDate) return;

            items.push({
                id: makeId(title, pdfUrl || CURRENT_ANNOUNCE_PAGE),
                municipality: '大和郡山市',
                title,
                type: classifyType(`${title} ${typeText}`),
                announcementDate,
                biddingDate,
                link: CURRENT_ANNOUNCE_PAGE,
                pdfUrl,
                status: '受付中',
            });
        });

        console.log(`[大和郡山市] 現行一覧ページ: ${items.length}件`);
        return items;
    } catch (e: unknown) {
        console.error('[大和郡山市] 現行一覧ページ取得エラー:', e instanceof Error ? e.message : String(e));
        return [];
    }
}

/**
 * 「入札」目次ページから「建設工事・建設工事に係る業務委託等入札の結果(令和X年度分)」
 * リンクを当年度・前年度分だけ解決する。ページIDが年度ごとに変わる(令和7年度=1893,
 * 令和8年度=1892 等)ためハードコードできない。
 */
async function resolveKensetsuKekkaPages(): Promise<{ url: string; reiwaYear: number }[]> {
    try {
        const currentReiwa = getCurrentReiwaFiscalYear();
        const html = await fetchHtml(KENSETSU_KEKKA_INDEX, 20000);
        const $ = cheerio.load(html);
        const pages: { url: string; reiwaYear: number }[] = [];

        $('a').each((_, el) => {
            const text = $(el).text().normalize('NFKC').replace(/\s+/g, '');
            const m = text.match(/建設工事.*入札の結果\(令和(\d+)年度分\)/);
            if (!m) return;
            const reiwaYear = parseInt(m[1], 10);
            if (reiwaYear !== currentReiwa && reiwaYear !== currentReiwa - 1) return;

            const href = $(el).attr('href') || '';
            if (!href) return;
            const url = href.startsWith('http') ? href : new URL(href, KENSETSU_KEKKA_INDEX).toString();
            pages.push({ url, reiwaYear });
        });

        return pages;
    } catch (e: unknown) {
        console.error('[大和郡山市] 建設工事結果ページ解決エラー:', e instanceof Error ? e.message : String(e));
        return [];
    }
}

/**
 * 建設工事等入札結果ページの一覧表(開札日|事業担当課|工事名|落札者|落札金額|結果PDF)を読む。
 * HTML中に落札者名・金額が直接載っているため、PDFを開かなくても結果が確定できる。
 */
async function scrapeKensetsuKekkaPage(url: string, reiwaYear: number): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];
    const fiscalYearStart = 2018 + reiwaYear;

    try {
        const html = await fetchHtml(url, 20000);
        const $ = cheerio.load(html);

        $('table').first().find('tr').slice(1).each((_, row) => {
            const cells = $(row).find('td').map((_, c) => $(c).text().trim()).toArray();
            if (cells.length < 6) return;

            const [dateText, , title, winnerRaw, amountText] = cells;
            if (!title || title.length < 4) return;
            if (SKIP_TITLE_KEYWORDS.some(kw => title.includes(kw))) return;

            const dm = dateText.match(/(\d{1,2})月(\d{1,2})日/);
            const biddingDate = dm
                ? `${fiscalMonthToCalendarYear(fiscalYearStart, parseInt(dm[1], 10))}-${dm[1].padStart(2, '0')}-${dm[2].padStart(2, '0')}`
                : undefined;

            const isUnsuccessful = /不成立|不調|中止/.test(amountText) || /^[‐－\-]$/.test(winnerRaw.trim());
            const winner = isUnsuccessful ? undefined : winnerRaw.trim();

            const pdfHref = $(row).find('a').first().attr('href') || '';
            const pdfUrl = pdfHref ? (pdfHref.startsWith('http') ? pdfHref : new URL(pdfHref, url).toString()) : undefined;

            items.push({
                id: makeId(title, `${url}-${dateText}`),
                municipality: '大和郡山市',
                title,
                type: classifyType(title),
                announcementDate: biddingDate || new Date().toISOString().split('T')[0],
                biddingDate,
                link: url,
                pdfUrl,
                status: isUnsuccessful ? '不調' : '落札',
                ...(winner ? { winningContractor: winner } : {}),
            });
        });

        console.log(`[大和郡山市] 建設工事結果(令和${reiwaYear}年度分): ${items.length}件`);
    } catch (e: unknown) {
        console.error(`[大和郡山市] 建設工事結果ページ取得エラー (${url}):`, e instanceof Error ? e.message : String(e));
    }

    return items;
}

export class YamatokoriyamaCityScraper implements Scraper {
    municipality: '大和郡山市' = '大和郡山市' as const;
    private errors: string[] = [];

    getDiagnostics() {
        return { errors: this.errors };
    }

    private recordError(message: string) {
        this.errors.push(message);
    }

    async scrape(): Promise<BiddingItem[]> {
        this.errors = [];
        const allItems = new Map<string, BiddingItem>();

        for (const { jsonUrl, status, label } of [
            { jsonUrl: ANNOUNCE_JSON, status: '受付中' as const, label: '入札公告' },
            { jsonUrl: RESULT_JSON,   status: '落札'   as const, label: '入札結果' },
        ]) {
            console.log(`[大和郡山市] ${label} JSON取得中...`);
            try {
                const children = await fetchChildPages(jsonUrl, /令和8年度|R8|令和7年度|R7/i);
                const relevant = children.filter(p => !p.is_category_index);
                console.log(`[大和郡山市] ${label}: ${children.length}件中 ${relevant.length}件が対象`);

                for (const page of relevant) {
                    const annoDate = page.publish_datetime
                        ? page.publish_datetime.split('T')[0]
                        : new Date().toISOString().split('T')[0];
                    const yearHint = annoDate.slice(0, 4);

                    const detail = await scrapeDetailPage(page.url, yearHint);

                    // テーブルに複数件がある場合
                    if (detail.tableItems && detail.tableItems.length > 0) {
                        for (const row of detail.tableItems) {
                            if (SKIP_TITLE_KEYWORDS.some(kw => row.title.includes(kw))) continue;
                            const item: BiddingItem = {
                                id: makeId(row.title, page.url),
                                municipality: '大和郡山市',
                                title: row.title,
                                type: classifyType(row.title + row.type),
                                announcementDate: annoDate,
                                biddingDate: row.biddingDate || detail.biddingDate || undefined,
                                link: page.url,
                                status,
                                ...(row.contractor && status === '落札' ? { winningContractor: row.contractor } : {}),
                            };
                            allItems.set(item.id, item);
                        }
                    } else {
                        // テーブルなし → ページタイトルで1件
                        const item: BiddingItem = {
                            id: makeId(page.page_name, page.url),
                            municipality: '大和郡山市',
                            title: page.page_name,
                            type: classifyType(page.page_name),
                            announcementDate: annoDate,
                            biddingDate: detail.biddingDate || undefined,
                            link: page.url,
                            status,
                            ...(detail.contractor && status === '落札' ? { winningContractor: detail.contractor } : {}),
                        };
                        allItems.set(item.id, item);
                    }
                    await new Promise(r => setTimeout(r, 200));
                }
                console.log(`[大和郡山市] ${label}: ${allItems.size}件（累計）`);
            } catch (e: unknown) {
                const message = e instanceof Error ? e.message : String(e);
                this.recordError(`[大和郡山市] ${label} エラー: ${message}`);
                console.error(`[大和郡山市] ${label} エラー:`, message);
            }
        }

        for (const item of await scrapeCurrentAnnouncementPage()) {
            allItems.set(item.id, item);
        }

        try {
            const kekkaPages = await resolveKensetsuKekkaPages();
            for (const { url, reiwaYear } of kekkaPages) {
                for (const item of await scrapeKensetsuKekkaPage(url, reiwaYear)) {
                    allItems.set(item.id, item);
                }
            }
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            this.recordError(`[大和郡山市] 建設工事結果 エラー: ${message}`);
            console.error('[大和郡山市] 建設工事結果 エラー:', message);
        }

        for (const item of KNOWN_CURRENT_ITEMS) {
            allItems.set(makeId(item.title, item.pdfUrl || item.link), {
                id: makeId(item.title, item.pdfUrl || item.link),
                municipality: '大和郡山市',
                title: item.title,
                type: item.type,
                announcementDate: item.announcementDate,
                biddingDate: item.biddingDate,
                link: item.link,
                pdfUrl: item.pdfUrl,
                status: item.status,
            });
        }

        for (const item of KNOWN_RESULT_ITEMS) {
            allItems.set(makeId(item.title, item.link), {
                id: makeId(item.title, item.link),
                municipality: '大和郡山市',
                title: item.title,
                type: item.type,
                announcementDate: item.announcementDate,
                biddingDate: item.biddingDate,
                link: item.link,
                status: item.status,
                winningContractor: item.winningContractor,
            });
        }

        const unique = Array.from(allItems.values()).sort((a, b) => b.announcementDate.localeCompare(a.announcementDate));
        console.log(`[大和郡山市] 合計 ${unique.length} 件`);
        return unique;
    }
}

import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
import { extractPdfText, parseJapaneseDateToIso } from './common/pdf_text';
import { classifyWinner } from './common/filter';
import { getFiscalYearStart } from './common/fiscal_year';

// 天理市 入札情報
// 入札公告: 1ページに全案件の案件概要テーブルが埋め込まれた静的HTML
// 入札結果: 案件ごとのPDF。「PDFのみだから」とスキップしていたため、
//          天理市は公告4件・結果0件という状態が続いていた。誰がいくらで取ったかが
//          分からないと市場の相場観も競合の動きも追えないので、PDFを解析して取り込む。
const BASE = 'https://www.city.tenri.nara.jp';
const ANNOUNCE_URL = `${BASE}/kakuka/soumubu/nyuusatsushinsashitsu/construction_work/kouji_hattyuu_kanren/1395887232147.html`;
const RESULT_URL = `${BASE}/kakuka/soumubu/nyuusatsushinsashitsu/construction_work/kouji_hattyuu_kanren/1395912138562.html`;
/** 1回の実行でPDFを解析する上限。全件解析すると実行時間が跳ね上がるため新しい順に打ち切る */
const RESULT_PDF_LIMIT = 40;
const TENRI_SUPPLEMENTAL_ITEMS: Array<{
    title: string;
    link: string;
    announcementDate: string;
    biddingDate?: string;
    status: '受付中' | '受付終了' | '落札' | '不調' | '不明';
    pdfUrl?: string;
    winningContractor?: string;
}> = [
    {
        title: '天理市環境クリーンセンター解体工事',
        link: ANNOUNCE_URL,
        announcementDate: '2026-05-29',
        status: '受付中',
    },
    {
        title: '天理市立丹波市・前栽・櫟本小学校屋内運動場断熱化工事',
        link: ANNOUNCE_URL,
        announcementDate: '2026-05-27',
        status: '受付中',
    },
    {
        title: '山の辺小学校建替え整備事業に伴う丹波市小学校給食室改修工事',
        link: ANNOUNCE_URL,
        announcementDate: '2026-05-27',
        status: '受付中',
    },
    {
        title: '天理市環境クリーンセンター解体工事発注支援等業務委託',
        link: 'https://www.city.tenri.nara.jp/kakuka/kankyoukeizaibu/kankyou_cleancenter_gyoumuka/15455.html',
        announcementDate: '2026-03-04',
        status: '不明',
        winningContractor: '株式会社 建設技術研究所 奈良事務所',
    },
];
const TENRI_KNOWN_BIDDING_DATES: Record<string, string> = {
    // 公告文 別紙1（入札日程）より
    '天理市立柳本小学校校舎18棟改修工事': '2026-05-18',
};

function classifyType(title: string, type: string): BiddingType {
    const t = title + type;
    if (t.includes('設計') || t.includes('測量') || t.includes('コンサル')) return 'コンサル';
    if (t.includes('委託') || t.includes('業務')) return '委託';
    return '建築';
}

function makeId(title: string): string {
    return `tenri-${crypto.createHash('md5').update(title).digest('hex').slice(0, 8)}`;
}

function parseJapaneseDate(text: string): string {
    const m = text.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (m) {
        const year = 2018 + parseInt(m[1]);
        return `${year}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }
    return '';
}

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; naramania-scraper/1.0)' };

function toAbsoluteUrl(href: string, pageUrl: string): string {
    if (!href) return '';
    if (href.startsWith('http')) return href;
    if (href.startsWith('//')) return `https:${href}`;
    if (href.startsWith('/')) return `${BASE}${href}`;
    return new URL(href, pageUrl).toString();
}

function cleanResultTitle(rawTitle: string): string {
    return rawTitle
        .replace(/\((?:PDF|Word|Excel)[^)]*\)/gi, '')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/（\s*PDF[^）]*）/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** 結果PDFから落札者を抽出する。様式が案件ごとに揺れるので複数パターンを順に試す */
function extractWinnerFromText(text: string): { winningContractor?: string; isFailed: boolean } {
    if (/(落札の有無\s*無|不調|不落|入札中止|取止め)/.test(text)) {
        return { isFailed: true };
    }

    const patterns = [
        /落札者(?:氏名|名|業者名)?\s*[:：]?\s*((?:株式会社|有限会社|合同会社|㈱|㈲)?[^\s、。]{2,30})/u,
        /落札業者\s*[:：]?\s*([^\s、。]{2,30})/u,
        /契約(?:の)?相手方\s*[:：]?\s*([^\s、。]{2,30})/u,
        /商号[、,]?\s*名称\s*[:：]?\s*([^\s、。]{2,30})/u,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        const name = match?.[1]?.trim();
        if (name && !/^[0-9,]+$/.test(name) && !name.includes('落札')) {
            return { winningContractor: name, isFailed: false };
        }
    }

    return { isFailed: false };
}

/**
 * 入札結果ページ（年度別ページ＋案件別PDF）から落札結果を取り込む。
 * 年度別サブページへのリンクがある構成にも、直接PDFが並ぶ構成にも対応させる。
 */
async function scrapeTenriResults(): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];
    const currentFiscalYear = getFiscalYearStart();
    const targetReiwa = [currentFiscalYear - 2018, currentFiscalYear - 2019];
    const pdfLinks = new Map<string, { title: string; date: string; pageUrl: string }>();

    const collectFromPage = async (pageUrl: string, followSubPages: boolean): Promise<string[]> => {
        const subPages: string[] = [];
        const res = await axios.get(pageUrl, { timeout: 20000, headers: HEADERS });
        const $ = cheerio.load(res.data);
        const pageDate = parseJapaneseDateToIso($('body').text());

        $('a[href]').each((_, el) => {
            const rawTitle = $(el).text().replace(/\s+/g, ' ').trim();
            const href = toAbsoluteUrl($(el).attr('href') || '', pageUrl);
            if (!rawTitle || !href) return;

            if (/\.pdf(?:$|\?)/i.test(href)) {
                const title = cleanResultTitle(rawTitle);
                if (title.length < 5) return;
                if (pdfLinks.has(href)) return;
                pdfLinks.set(href, {
                    title,
                    date: parseJapaneseDateToIso(rawTitle) || pageDate,
                    pageUrl,
                });
                return;
            }

            if (!followSubPages) return;
            // 「令和N年度 入札結果」のような年度別サブページを1階層だけ辿る
            const reiwaMatch = rawTitle.match(/令和\s*(\d+)\s*年度/);
            if (!reiwaMatch) return;
            if (!targetReiwa.includes(parseInt(reiwaMatch[1], 10))) return;
            if (!href.startsWith(BASE) || !/\.html?$/.test(href)) return;
            subPages.push(href);
        });

        return subPages;
    };

    try {
        const subPages = await collectFromPage(RESULT_URL, true);
        for (const subPage of subPages) {
            try {
                await collectFromPage(subPage, false);
            } catch (error) {
                console.warn('[天理市] 入札結果サブページ取得エラー:', error instanceof Error ? error.message : String(error));
            }
        }
    } catch (error) {
        console.error('[天理市] 入札結果ページ取得エラー:', error instanceof Error ? error.message : String(error));
        return items;
    }

    const targets = Array.from(pdfLinks.entries())
        .sort(([, a], [, b]) => (b.date || '').localeCompare(a.date || ''))
        .slice(0, RESULT_PDF_LIMIT);
    console.log(`[天理市] 入札結果PDF: ${pdfLinks.size}件中 ${targets.length}件を解析`);

    const CONCURRENCY = 3;
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
        const batch = targets.slice(i, i + CONCURRENCY);
        const parsed = await Promise.all(batch.map(async ([pdfUrl, meta]) => {
            try {
                const text = await extractPdfText(pdfUrl);
                const biddingDate = parseJapaneseDateToIso(text) || meta.date;
                return { pdfUrl, meta, biddingDate, ...extractWinnerFromText(text) };
            } catch {
                return { pdfUrl, meta, biddingDate: meta.date, isFailed: false, winningContractor: undefined };
            }
        }));

        for (const entry of parsed) {
            const date = entry.biddingDate || entry.meta.date || '';
            items.push({
                id: makeId(`result-${entry.meta.title}-${date}`),
                municipality: '天理市',
                title: entry.meta.title,
                type: classifyType(entry.meta.title, ''),
                announcementDate: date,
                biddingDate: date || undefined,
                link: entry.meta.pageUrl,
                pdfUrl: entry.pdfUrl,
                status: entry.isFailed ? '不調' : entry.winningContractor ? '落札' : '受付終了',
                winningContractor: entry.winningContractor,
                winnerType: classifyWinner(entry.winningContractor || ''),
            });
        }
    }

    return items;
}

export class TenriCityScraper implements Scraper {
    municipality: '天理市' = '天理市' as const;

    async scrape(): Promise<BiddingItem[]> {
        const allItems: BiddingItem[] = [];
        console.log('[天理市] 入札公告 取得中...');

        try {
            const res = await axios.get(ANNOUNCE_URL, { timeout: 20000, headers: HEADERS });
            const $ = cheerio.load(res.data);

            // caption="案件概要" のテーブルを全て処理
            $('table').each((_, tbl) => {
                const caption = $(tbl).find('caption').text().trim();
                if (caption !== '案件概要') return;

                // key-value テーブルをパース
                const kv: Record<string, string> = {};
                $(tbl).find('tr').each((_, row) => {
                    const cells = $(row).find('td');
                    if (cells.length >= 2) {
                        const key = cells.eq(0).text().trim();
                        const val = cells.eq(1).text().trim().replace(/\s+/g, ' ');
                        if (key) kv[key] = val;
                    }
                });

                const title = kv['工事名'] || kv['業務名'] || kv['件名'] || '';
                const annoDateText = kv['公告日'] || kv['告示日'] || '';
                const type = kv['工事種別'] || kv['業種'] || '';

                if (!title) return;

                const annoDate = parseJapaneseDate(annoDateText) || new Date().toISOString().split('T')[0];

                // 近隣のPDFリンク
                const pdfHref = $(tbl).find('a[href*=".pdf"]').first().attr('href')
                    || $(tbl).parent().find('a[href*=".pdf"]').first().attr('href') || '';
                const pdfUrl = pdfHref ? (pdfHref.startsWith('//') ? `https:${pdfHref}` : pdfHref) : undefined;

                allItems.push({
                    id: makeId(title),
                    municipality: '天理市',
                    title,
                    type: classifyType(title, type),
                    announcementDate: annoDate,
                    biddingDate: TENRI_KNOWN_BIDDING_DATES[title],
                    link: ANNOUNCE_URL,
                    pdfUrl,
                    status: '受付中',
                });
            });

            console.log(`[天理市] 入札公告: ${allItems.length}件`);
        } catch (e: unknown) {
            console.error('[天理市] スクレイパーエラー:', e instanceof Error ? e.message : String(e) || e);
        }

        // ── 入札結果（落札）─────────────────────────────
        console.log('[天理市] 入札結果 取得中...');
        const resultItems = await scrapeTenriResults();
        for (const resultItem of resultItems) {
            const existing = allItems.find(item => item.title === resultItem.title);
            if (!existing) {
                allItems.push(resultItem);
                continue;
            }
            // 公告で拾った案件に結果を上書きする
            if (resultItem.winningContractor) {
                existing.winningContractor = resultItem.winningContractor;
                existing.winnerType = resultItem.winnerType;
            }
            if (resultItem.status === '落札' || resultItem.status === '不調') existing.status = resultItem.status;
            if (resultItem.biddingDate && !existing.biddingDate) existing.biddingDate = resultItem.biddingDate;
            if (resultItem.pdfUrl && !existing.pdfUrl) existing.pdfUrl = resultItem.pdfUrl;
        }
        console.log(`[天理市] 入札結果: ${resultItems.length}件`);

        for (const supplemental of TENRI_SUPPLEMENTAL_ITEMS) {
            if (allItems.some(item => item.title === supplemental.title)) continue;
            allItems.push({
                id: makeId(supplemental.title),
                municipality: '天理市',
                title: supplemental.title,
                type: classifyType(supplemental.title, ''),
                announcementDate: supplemental.announcementDate,
                biddingDate: supplemental.biddingDate,
                link: supplemental.link,
                pdfUrl: supplemental.pdfUrl,
                status: supplemental.status,
                winningContractor: supplemental.winningContractor,
            });
        }

        console.log(`[天理市] 合計 ${allItems.length} 件`);
        return allItems;
    }
}

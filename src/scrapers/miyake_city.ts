import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, BiddingType, Scraper } from '../types/bidding';
import { classifyWinner, shouldKeepItem } from './common/filter';
import { getCurrentReiwaFiscalYear } from './common/fiscal_year';

const BASE_URL = 'https://www.town.miyake.lg.jp';
// 公告・結果ページは年度替わりでURLが変わるため、総務課ページから動的に解決する
const SOMU_INDEX_URL = `${BASE_URL}/soshiki/1/index.html`;
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; naramania-scraper/1.0)' };

interface MiyakePageUrls {
    announceUrls: string[];
    resultUrls: string[];
}

async function resolveMiyakePageUrls(): Promise<MiyakePageUrls> {
    const announceUrls: string[] = [];
    const resultUrls: string[] = [];
    try {
        const res = await axios.get(SOMU_INDEX_URL, { headers: HEADERS, timeout: 20000 });
        const $ = cheerio.load(res.data);
        const currentReiwa = getCurrentReiwaFiscalYear();
        $('a').each((_, el) => {
            // NFKC正規化で全角数字・全角括弧を半角に揃える（令和８年度（工事）→ 令和8年度(工事)）
            const text = $(el).text().replace(/\s+/g, '').normalize('NFKC');
            const href = makeAbsoluteUrl($(el).attr('href'));
            if (!href) return;
            if (/^入札\(建設工事\)$|^入札\(業務\)$/.test(text)) {
                announceUrls.push(href);
                return;
            }
            const m = text.match(/^令和(\d+)年度入札結果\((工事|業務)\)$/);
            if (m && parseInt(m[1]) === currentReiwa) {
                resultUrls.push(href);
            }
        });
    } catch (e: unknown) {
        console.error('[三宅町] ページURL解決エラー:', e instanceof Error ? e.message : String(e));
    }
    return { announceUrls: [...new Set(announceUrls)], resultUrls: [...new Set(resultUrls)] };
}
const KNOWN_MIYAKE_ITEMS: BiddingItem[] = [
    {
        id: buildId('2025-11-04', '三宅町つながり総合センター解体工事'),
        municipality: '三宅町',
        title: '三宅町つながり総合センター解体工事',
        type: '建築',
        announcementDate: '2025-11-04',
        biddingDate: '2025-11-04',
        link: 'https://www.town.miyake.lg.jp/soshiki/1/7653.html',
        status: '受付終了',
    },
    {
        id: buildId('2025-02-02', '三宅町つながり総合センター解体工事設計委託業務'),
        municipality: '三宅町',
        title: '三宅町つながり総合センター解体工事設計委託業務',
        type: 'コンサル',
        announcementDate: '2025-02-02',
        link: 'https://www.town.miyake.lg.jp/soshiki/1/5923.html',
        status: '受付終了',
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
    const western = text.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日/);
    if (western) {
        return `${western[1]}-${western[2].padStart(2, '0')}-${western[3].padStart(2, '0')}`;
    }
    return '';
}

function makeAbsoluteUrl(href?: string | null): string | undefined {
    if (!href) return undefined;
    if (href.startsWith('http')) return href;
    if (href.startsWith('/')) return `${BASE_URL}${href}`;
    return new URL(href, `${BASE_URL}/`).toString();
}

function buildId(date: string, title: string): string {
    return `miyake-${date || 'undated'}-${title}`
        .normalize('NFKC')
        .replace(/[^\w\u3040-\u30ff\u3400-\u9fff-]+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 120);
}

function cleanTitle(title: string): string {
    return title
        .replace(/^[0-9０-９]+[\.．]\s*/, '')
        .replace(/\s*\[PDFファイル／[^\]]+\]\s*/g, '')
        // 公告ページのリンク文言は「〜業務特記仕様書」のように添付PDF名になっているため案件名に整える
        .replace(/(特記)?仕様書$/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

async function scrapeAnnouncements(announceUrl: string): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];

    try {
        const res = await axios.get(announceUrl, { headers: HEADERS, timeout: 20000 });
        const $ = cheerio.load(res.data);
        const pageDate = parseJapaneseDate($('body').text());
        $('a').each((_, el) => {
            const title = cleanTitle($(el).text());
            const href = makeAbsoluteUrl($(el).attr('href'));
            if (!title || !href) return;
            if (!shouldKeepItem(title)) return;
            if (!/(工事|設計|委託|業務)/.test(title)) return;

            items.push({
                id: buildId(pageDate, title),
                municipality: '三宅町',
                title,
                type: classifyType(title),
                announcementDate: pageDate,
                link: href,
                pdfUrl: href.toLowerCase().endsWith('.pdf') ? href : undefined,
                status: '受付中',
            });
        });
    } catch (e: unknown) {
        console.error('[三宅町] 公告取得エラー:', e instanceof Error ? e.message : String(e));
    }

    return items;
}

async function scrapeResultPage(url: string): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];

    try {
        const res = await axios.get(url, { headers: HEADERS, timeout: 20000 });
        const $ = cheerio.load(res.data);
        const pageDate = parseJapaneseDate($('body').text());

        $('a[href$=".pdf"]').each((_, el) => {
            const title = cleanTitle($(el).text());
            const pdfUrl = makeAbsoluteUrl($(el).attr('href'));
            if (!title || !pdfUrl) return;
            if (!shouldKeepItem(title)) return;

            items.push({
                id: buildId(pageDate, title),
                municipality: '三宅町',
                title,
                type: classifyType(title),
                announcementDate: pageDate,
                biddingDate: pageDate || undefined,
                link: url,
                pdfUrl,
                status: '落札',
                winnerType: classifyWinner(''),
            });
        });
    } catch (e: unknown) {
        console.error('[三宅町] 結果取得エラー:', e instanceof Error ? e.message : String(e));
    }

    return items;
}

export class MiyakeCityScraper implements Scraper {
    municipality: '三宅町' = '三宅町' as const;

    async scrape(): Promise<BiddingItem[]> {
        const { announceUrls, resultUrls } = await resolveMiyakePageUrls();
        console.log(`[三宅町] 公告${announceUrls.length}ページ / 結果${resultUrls.length}ページ`);
        const items: BiddingItem[] = [];
        for (const url of announceUrls) {
            items.push(...(await scrapeAnnouncements(url)));
        }
        for (const url of resultUrls) {
            items.push(...(await scrapeResultPage(url)));
        }
        for (const knownItem of KNOWN_MIYAKE_ITEMS) {
            if (!items.some(item => item.title === knownItem.title)) {
                items.push(knownItem);
            }
        }

        console.log(`[三宅町] 合計 ${items.length} 件`);
        return items;
    }
}

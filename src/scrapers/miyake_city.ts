import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, BiddingType, Scraper } from '../types/bidding';
import { classifyWinner, shouldKeepItem } from './common/filter';

const BASE_URL = 'https://www.town.miyake.lg.jp';
const ANNOUNCE_URL = `${BASE_URL}/soshiki/1/9178.html`;
const RESULT_WORK_URL = `${BASE_URL}/soshiki/1/7653.html`;
const RESULT_CONSULT_URL = `${BASE_URL}/soshiki/1/7919.html`;
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; naramania-scraper/1.0)' };

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
        .replace(/\s+/g, ' ')
        .trim();
}

async function scrapeAnnouncements(): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];

    try {
        const res = await axios.get(ANNOUNCE_URL, { headers: HEADERS, timeout: 20000 });
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
        const items = [
            ...(await scrapeAnnouncements()),
            ...(await scrapeResultPage(RESULT_WORK_URL)),
            ...(await scrapeResultPage(RESULT_CONSULT_URL)),
        ];
        console.log(`[三宅町] 合計 ${items.length} 件`);
        return items;
    }
}

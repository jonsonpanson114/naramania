import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, BiddingType, Scraper } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

const BASE_URL = 'https://www.town.nara-kawanishi.lg.jp';
const ANNOUNCEMENT_URLS = [
    `${BASE_URL}/0000008784.html`,
    `${BASE_URL}/0000008613.html`,
];
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; naramania-scraper/1.0)' };
const KNOWN_KAWANISHI_ITEMS: BiddingItem[] = [
    {
        id: buildId('2026-04-02', '川西小学校屋内運動場空調設備整備工事'),
        municipality: '川西町',
        title: '川西小学校屋内運動場空調設備整備工事',
        type: '建築',
        announcementDate: '2026-04-02',
        biddingDate: '2026-04-28',
        link: 'https://www.town.nara-kawanishi.lg.jp/0000008784.html',
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

function buildId(date: string, title: string): string {
    return `kawanishi-${date || 'undated'}-${title}`
        .normalize('NFKC')
        .replace(/[^\w\u3040-\u30ff\u3400-\u9fff-]+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 120);
}

async function scrapeAnnouncementPages(): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];

    for (const url of ANNOUNCEMENT_URLS) {
        try {
            const res = await axios.get(url, { headers: HEADERS, timeout: 20000 });
            const $ = cheerio.load(res.data);
            const title = $('h1').first().text().replace(/\s+/g, ' ').trim();
            const announcementDate = parseJapaneseDate($('body').text());
            if (!title || !shouldKeepItem(title)) continue;

            items.push({
                id: buildId(announcementDate, title),
                municipality: '川西町',
                title,
                type: classifyType(title),
                announcementDate,
                biddingDate: parseJapaneseDate($('body').text().match(/開札日時[\s\S]{0,100}/)?.[0] || '') || undefined,
                link: url,
                status: '受付中',
            });
        } catch {
            // Skip missing historical pages.
        }
    }

    return items;
}

export class KawanishiCityScraper implements Scraper {
    municipality: '川西町' = '川西町' as const;

    async scrape(): Promise<BiddingItem[]> {
        const items = await scrapeAnnouncementPages();
        for (const knownItem of KNOWN_KAWANISHI_ITEMS) {
            if (!items.some(item => item.title === knownItem.title)) {
                items.push(knownItem);
            }
        }
        console.log(`[川西町] 合計 ${items.length} 件`);
        return items;
    }
}

import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { BiddingItem, BiddingType, Scraper } from '../types/bidding';

const BASE_URL = 'https://www.city.gojo.lg.jp';
const RESULT_JSON_URLS = [
    `${BASE_URL}/jigyousha/nyuusatsu/8/R8/index.tree.json`,
    `${BASE_URL}/jigyousha/nyuusatsu/8/R7/index.tree.json`,
];
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; naramania-scraper/1.0)' };

const ARCHITECTURE_CONTEXT = [
    '建築', '建築設備', '公民館', '施設', '庁舎', '学校', '校舎', '住宅',
    '団地', '消防', '空調', '防火設備', '特定建築物',
];

const ARCHITECTURE_WORK = [
    '工事', '改修', '修繕', '新築', '解体', '設計', '監理', '業務委託',
    '委託', '定期調査', '定期検査', '更新',
];

const EXCLUDE = [
    '印刷', '配付', '広告', '購入', 'おむつ', 'システム', '物品', '車両',
    '電気工作物保安管理', '開票', '投票', '広報', '紙',
    'PR動画', '草刈', '浄化槽',
];

interface CmsPage {
    page_name: string;
    url: string;
    publish_datetime: string;
}

function shouldKeepGojoTitle(title: string): boolean {
    if (EXCLUDE.some(keyword => title.includes(keyword))) return false;
    return ARCHITECTURE_CONTEXT.some(keyword => title.includes(keyword))
        && ARCHITECTURE_WORK.some(keyword => title.includes(keyword));
}

function classifyType(title: string): BiddingType {
    if (title.includes('設計') || title.includes('監理')) return 'コンサル';
    if (title.includes('委託') || title.includes('業務')) return '委託';
    return '建築';
}

function makeId(title: string, suffix = ''): string {
    return `gojo-${crypto.createHash('md5').update(title + suffix).digest('hex').slice(0, 8)}`;
}

function parseJapaneseDate(text: string): string {
    const reiwa = text.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (reiwa) {
        const year = 2018 + Number(reiwa[1]);
        return `${year}-${String(Number(reiwa[2])).padStart(2, '0')}-${String(Number(reiwa[3])).padStart(2, '0')}`;
    }
    return '';
}

async function scrapeDetailPage(url: string): Promise<{ biddingDate?: string; pdfUrl?: string }> {
    try {
        const res = await axios.get(url, { timeout: 15000, headers: HEADERS });
        const $ = cheerio.load(res.data);
        const bodyText = $('body').text().replace(/\s+/g, ' ');
        const biddingDate = parseJapaneseDate(bodyText.match(/令和\s*\d+\s*年\s*\d+\s*月\s*\d+\s*日開札/) ? bodyText : '');
        const pdfHref = $('a[href*=".pdf"]').first().attr('href') || '';
        const pdfUrl = pdfHref
            ? (pdfHref.startsWith('http') ? pdfHref : new URL(pdfHref, url).toString())
            : undefined;
        return { biddingDate: biddingDate || undefined, pdfUrl };
    } catch {
        return {};
    }
}

export class GojoCityScraper implements Scraper {
    municipality: '五條市' = '五條市' as const;

    async scrape(): Promise<BiddingItem[]> {
        const items: BiddingItem[] = [];

        for (const feedUrl of RESULT_JSON_URLS) {
            try {
                const res = await axios.get<CmsPage[]>(feedUrl, { timeout: 15000, headers: HEADERS });
                const pages = res.data.filter(page => shouldKeepGojoTitle(page.page_name));
                console.log(`[五條市] ${feedUrl}: ${pages.length}件対象`);

                for (const page of pages) {
                    const detail = await scrapeDetailPage(page.url);
                    items.push({
                        id: makeId(page.page_name, page.url),
                        municipality: '五條市',
                        title: page.page_name.replace(/^【入札結果】\s*/, ''),
                        type: classifyType(page.page_name),
                        announcementDate: page.publish_datetime.split('T')[0],
                        biddingDate: detail.biddingDate,
                        link: page.url,
                        pdfUrl: detail.pdfUrl,
                        status: '落札',
                    });
                }
            } catch (e: unknown) {
                console.error('[五條市] フィード取得エラー:', e instanceof Error ? e.message : String(e));
            }
        }

        console.log(`[五條市] 合計 ${items.length} 件`);
        return items;
    }
}

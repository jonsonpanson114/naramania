import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { BiddingItem, BiddingType, Scraper } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

const BASE_URL = 'https://www.city.gojo.lg.jp';
const RESULT_JSON_URLS = [
    `${BASE_URL}/jigyousha/nyuusatsu/8/R8/index.tree.json`,
    `${BASE_URL}/jigyousha/nyuusatsu/8/R7/index.tree.json`,
];
const EDUCATION_LIST_URL = `${BASE_URL}/soshiki/kyouiku/1_2/index.html`;
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
    'PR動画', '草刈', '浄化槽', 'ネットワーク', '警備',
];

interface CmsPage {
    page_name: string;
    url: string;
    publish_datetime: string;
}

function shouldKeepGojoTitle(title: string): boolean {
    if (EXCLUDE.some(keyword => title.includes(keyword))) return false;
    return shouldKeepItem(title) || (
        ARCHITECTURE_CONTEXT.some(keyword => title.includes(keyword))
        && ARCHITECTURE_WORK.some(keyword => title.includes(keyword))
    );
}

function classifyType(title: string): BiddingType {
    if (title.includes('設計') || title.includes('監理')) return 'コンサル';
    if (title.includes('委託') || title.includes('業務')) return '委託';
    return '建築';
}

function makeId(title: string, suffix = ''): string {
    return `gojo-${crypto.createHash('md5').update(title + suffix).digest('hex').slice(0, 8)}`;
}

function normalizeGojoTitle(title: string): string {
    return title
        .replace(/^【入札(?:結果|公告)】\s*/, '')
        .replace(/（令和\s*\d+\s*年\s*\d+\s*月\s*\d+\s*日開札）$/, '')
        .trim();
}

function parseJapaneseDate(text: string): string {
    const reiwa = text.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (reiwa) {
        const year = 2018 + Number(reiwa[1]);
        return `${year}-${String(Number(reiwa[2])).padStart(2, '0')}-${String(Number(reiwa[3])).padStart(2, '0')}`;
    }
    return '';
}

function gojoItemKey(title: string, biddingDate?: string, link?: string): string {
    if (biddingDate) {
        return `${title}::${biddingDate}`;
    }

    return `${title}::${link || ''}`;
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

async function scrapeEducationPages(): Promise<BiddingItem[]> {
    try {
        const res = await axios.get(EDUCATION_LIST_URL, { timeout: 15000, headers: HEADERS });
        const $ = cheerio.load(res.data);
        const items: BiddingItem[] = [];

        for (const anchor of $('li.page a').toArray()) {
            const title = $(anchor).text().trim();
            if (!title.startsWith('【入札')) continue;
            if (!shouldKeepGojoTitle(title)) continue;

            const href = $(anchor).attr('href');
            if (!href) continue;

            const pageUrl = href.startsWith('http') ? href : new URL(href, BASE_URL).toString();
            const detail = await scrapeDetailPage(pageUrl);
            const announcementDate = parseJapaneseDate(title) || '';
            const status = title.includes('入札結果') ? '落札' : '受付中';
            const normalizedTitle = normalizeGojoTitle(title);

            items.push({
                id: makeId(normalizedTitle, pageUrl),
                municipality: '五條市',
                title: normalizedTitle,
                type: classifyType(title),
                announcementDate,
                biddingDate: detail.biddingDate,
                link: pageUrl,
                pdfUrl: detail.pdfUrl,
                status,
            });
        }

        return items;
    } catch (e: unknown) {
        console.error('[五條市] 教育委員会ページ取得エラー:', e instanceof Error ? e.message : String(e));
        return [];
    }
}

function mergeGojoItem(existing: BiddingItem | undefined, incoming: BiddingItem): BiddingItem {
    if (!existing) return incoming;

    return {
        ...existing,
        ...incoming,
        announcementDate: existing.announcementDate > incoming.announcementDate
            ? existing.announcementDate
            : incoming.announcementDate,
        biddingDate: incoming.biddingDate || existing.biddingDate,
        pdfUrl: incoming.pdfUrl || existing.pdfUrl,
        link: incoming.pdfUrl ? incoming.link : existing.link,
    };
}

export class GojoCityScraper implements Scraper {
    municipality: '五條市' = '五條市' as const;

    async scrape(): Promise<BiddingItem[]> {
        const items = new Map<string, BiddingItem>();

        for (const feedUrl of RESULT_JSON_URLS) {
            try {
                const res = await axios.get<CmsPage[]>(feedUrl, { timeout: 15000, headers: HEADERS });
                const pages = res.data.filter(page => shouldKeepGojoTitle(page.page_name));
                console.log(`[五條市] ${feedUrl}: ${pages.length}件対象`);

                for (const page of pages) {
                    const detail = await scrapeDetailPage(page.url);
                    const normalizedTitle = normalizeGojoTitle(page.page_name);
                    const item: BiddingItem = {
                        id: makeId(normalizedTitle, page.url),
                        municipality: '五條市',
                        title: normalizedTitle,
                        type: classifyType(page.page_name),
                        announcementDate: page.publish_datetime.split('T')[0],
                        biddingDate: detail.biddingDate,
                        link: page.url,
                        pdfUrl: detail.pdfUrl,
                        status: '落札',
                    };
                    const key = gojoItemKey(normalizedTitle, detail.biddingDate, page.url);
                    items.set(key, mergeGojoItem(items.get(key), item));
                }
            } catch (e: unknown) {
                console.error('[五條市] フィード取得エラー:', e instanceof Error ? e.message : String(e));
            }
        }

        for (const item of await scrapeEducationPages()) {
            const key = gojoItemKey(item.title, item.biddingDate, item.link);
            items.set(key, mergeGojoItem(items.get(key), item));
        }

        const unique = Array.from(items.values()).sort((a, b) => b.announcementDate.localeCompare(a.announcementDate));
        console.log(`[五條市] 合計 ${unique.length} 件`);
        return unique;
    }
}

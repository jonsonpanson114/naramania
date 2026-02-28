import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

// 五條市 入札情報（SMART CMS tree.json API経由）
const BASE = 'https://www.city.gojo.lg.jp';
// 入札結果のみ（公告ページは未整備）
const RESULT_JSON = `${BASE}/soshiki/keiyakukensa/1_1/7/index.tree.json`;

const INCLUDE_KEYWORDS = [
    '工事', '設計', '改修', '修繕', '新築', '建設', '解体', '建築',
    '測量', '点検', '耐震', '監理', '計画', '補修', '整備', '施設',
];
const SKIP_KEYWORDS = [
    '車両', '物品', '清掃', '警備', '廃棄', 'システム', '役務', '電力',
    '下水', '管渠', '舗装', '土木', '河川', '造園', '電気通信', '水道施設',
    '日用品', '雑貨', '農業', '燃料',
];

function titleSeemsRelevant(title: string): boolean {
    // INCLUDE_KEYWORDS のいずれかを含む（建築・設計系）+ 土木系でない
    if (!INCLUDE_KEYWORDS.some(kw => title.includes(kw))) return false;
    return shouldKeepItem(title);
}

function classifyType(title: string): BiddingType {
    if (title.includes('設計') || title.includes('測量') || title.includes('コンサル')) return 'コンサル';
    if (title.includes('委託') || title.includes('業務')) return '委託';
    return '建築';
}

function makeId(title: string, suffix: string = ''): string {
    return `gojo-${crypto.createHash('md5').update(title + suffix).digest('hex').slice(0, 8)}`;
}

interface CmsPage {
    page_name: string;
    url: string;
    publish_datetime: string;
    is_category_index?: boolean;
    child_pages?: CmsPage[];
}

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; naramania-scraper/1.0)' };

async function scrapeDetailPage(url: string): Promise<{ biddingDate?: string; pdfUrl?: string }> {
    try {
        const res = await axios.get(url, { timeout: 15000, headers: HEADERS });
        const $ = cheerio.load(res.data);
        const bodyText = $('body').text();

        // 開札日
        const bm = bodyText.match(/開札日[：:]\s*([^\n]+)/);
        let biddingDate: string | undefined;
        if (bm) {
            const m = bm[1].match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
            if (m) {
                const year = 2018 + parseInt(m[1]);
                biddingDate = `${year}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
            }
        }

        // PDF URL
        const pdfHref = $('a[href*=".pdf"]').first().attr('href') || '';
        const pdfUrl = pdfHref ? (pdfHref.startsWith('//') ? `https:${pdfHref}` : pdfHref) : undefined;

        return { biddingDate, pdfUrl };
    } catch {
        return {};
    }
}

export class GojoCityScraper implements Scraper {
    municipality: '五條市' = '五條市';

    async scrape(): Promise<BiddingItem[]> {
        const allItems: BiddingItem[] = [];
        console.log('[五條市] 入札結果 JSON取得中...');

        try {
            const res = await axios.get<CmsPage[]>(RESULT_JSON, { timeout: 15000, headers: HEADERS });
            const pages: CmsPage[] = res.data;
            const relevant = pages.filter(p => !p.is_category_index && titleSeemsRelevant(p.page_name));
            console.log(`[五條市] 入札結果: ${pages.length}件中 ${relevant.length}件が対象`);

            for (const page of relevant) {
                const annoDate = page.publish_datetime
                    ? page.publish_datetime.split('T')[0]
                    : new Date().toISOString().split('T')[0];

                const detail = await scrapeDetailPage(page.url);

                allItems.push({
                    id: makeId(page.page_name, page.url),
                    municipality: '五條市',
                    title: page.page_name.replace(/^【入札結果】\s*/, ''),
                    type: classifyType(page.page_name),
                    announcementDate: annoDate,
                    biddingDate: detail.biddingDate,
                    link: page.url,
                    pdfUrl: detail.pdfUrl,
                    status: '落札',
                });
                await new Promise(r => setTimeout(r, 200));
            }
        } catch (e: any) {
            console.error('[五條市] スクレイパーエラー:', e.message || e);
        }

        console.log(`[五條市] 合計 ${allItems.length} 件`);
        return allItems;
    }
}

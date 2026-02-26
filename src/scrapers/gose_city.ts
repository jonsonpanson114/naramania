import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, Scraper } from '../types/bidding';

// 五條市
const RSS_URL = 'https://www.city.gose.nara.jp/rss/rss.xml';

// 月別ページURL: pattern like https://www.city.gose.nara.jp/category/6-9-0-0-0-0-0-0-0-0-0-0-0.html
const MONTH_BASE = 'https://www.city.gose.nara.jp/category';

// スキップキーワード
const SKIP_KEYWORDS = [
    '道路', '舗装', '下水道', '河川', '砂防', '水道', '管工事', '橋梁', '護岸',
    '側溝', '水路', '排水', 'マンホール', '配水管', '布設替', '管路', '電気通信',
    '造園', 'カルバート', '樋門', '土木', '舗装維持', '除草', 'バッテリー',
];

function shouldSkip(title: string): boolean {
    return SKIP_KEYWORDS.some(kw => title.includes(kw));
}

function classifyType(title: string): '建築' | 'その他' {
    if (title.includes('設計') || title.includes('測量') || title.includes('コンサル')) {
        return 'コンサル';
    }
    return '建築';
}

// RSS XML解析
function parseRssDate(dateStr: string): string {
    // "Fri, 21 Feb 2025 12:00:00 JST" → "2025-02-21"
    const m = dateStr.match(/(\w+),\s+(\d+)\s+(\d{4}):(\d{2}):(\d{2}):(\d{4})/);
    if (!m) return '';
    const y = parseInt(m);
    const d = parseInt(m);
    const year = dateStr.match(/(\d{4})/);
    if (year) {
        const fy = parseInt(year[0]);
        if (y >= 2019) return `令和${fy - 2018}年度`;
    return `平成${fy - 2018}年度`;
}

async function scrapeGoseCity(): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];

    try {
        // RSSフィードを取得
        const res = await axios.get(RSS_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000,
        });
        const $ = cheerio.load(res.data);

        // RSS itemの抽出
        $('item').each((i, el) => {
            const title = $(el).find('title').text().trim();
            const link = $(el).find('link').attr('href') || '';
            if (!title) return;

            // 月別ページのリンクを優先
            if (link.includes('category/6-9-0-0-0-0-0-0-0.html')) {
                const m = title.match(/令和(\d+)年(\d+)月/)?.[1];
                if (!m) return;
                const url = MONTH_BASE.replace('6-9-0-0-0-0-0', m);

                items.push({
                    id: `gose-${title.slice(0, 20)}`,
                    municipality: '五條市',
                    title,
                    type: classifyType(title),
                    announcementDate: parseRssDate(m),
                    link: url.startsWith('http') ? url : `https://www.city.gose.nara.jp${url}`,
                    status: '受付中', // RSSの新着は公告と仮定
                });
            }
        });

    } catch (e: any) {
        console.error('[五條市] エラー:', e.message || e);
    }

    console.log(`[五條市] 合計 ${items.length} 件`);
    return items;
}

export class GoseCityScraper implements Scraper {
    municipality: '五條市' = '五條市';

    async scrape(): Promise<BiddingItem[]> {
        return scrapeGoseCity();
    }
}

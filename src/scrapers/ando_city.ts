import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, Scraper } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

// 安堵町
const RSS_URL = 'https://www.town.ando.nara.jp/rss/rss.xml';

// スキップキーワード
const SKIP_KEYWORDS = [
    '道路', '舗装', '下水道', '河川', '砂防', '水道', '管工事', '橋梁', '護岸',
    '側溝', '水路', '排水', 'マンホール', '配水管', '布設替', '管路', '電気通信',
    '造園', 'カルバート', '樋門', '土木', '舗装維持', '除草', 'バッテリー',
];

function shouldSkip(title: string): boolean {
    return !shouldKeepItem(title);
}

function classifyType(title: string): '建築' | 'その他' {
    if (title.includes('設計') || title.includes('測量') || title.includes('コンサル')) {
        return 'コンサル';
    }
    if (title.includes('業務委託') || title.includes('委託')) {
        return 'その他';
    }
    return '建築';
}

function parseRssDate(dateStr: string): string {
    // "Tue, 24 Feb 2026 09:58:26 +0900" → "2026-02-24"
    const m = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
    if (!m) return '';

    const day = parseInt(m[1]);
    const month = m[2];
    const year = m[3];

    const monthMap: Record<string, number> = {
        'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
        'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
    };

    const monthNum = monthMap[month];
    if (!monthNum) return '';

    return `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

async function scrapeAndoCity(): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];

    try {
        // RSSフィードを取得
        const res = await axios.get(RSS_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000,
        });
        const $ = cheerio.load(res.data, { xmlMode: true });

        // RSS itemの抽出
        $('item').each((i, el) => {
            const title = $(el).find('title').text().trim();
            const link = $(el).find('link').text().trim();
            const pubDate = $(el).find('pubDate').text().trim();

            if (!title || !link) return;

            // 入札・契約・工事に関する項目のみ抽出
            if (!title.includes('入札') && !title.includes('契約') &&
                !title.includes('落札') && !title.includes('工事')) {
                return;
            }

            // 令和8年度以降は対象外（令和7年度のみ収集）
            const fyMatch = title.match(/令和(\d+)年度/);
            if (fyMatch && parseInt(fyMatch[1]) > 7) return;

            if (shouldSkip(title)) return;

            // ステータス判定
            let status: '受付中' | '締切間近' | '受付終了' | '落札' = '受付中';
            if (title.includes('落札') || title.includes('結果')) {
                status = '落札';
            } else if (title.includes('資格審査')) {
                status = '受付終了';
            }

            const announcementDate = parseRssDate(pubDate);

            items.push({
                id: `ando-${link.split('/').pop()?.replace('.html', '')}-${i}`,
                municipality: '安堵町',
                title,
                type: classifyType(title),
                announcementDate,
                link,
                status,
            });
        });

    } catch (e: any) {
        console.error('[安堵町] エラー:', e.message || e);
    }

    console.log(`[安堵町] 合計 ${items.length} 件`);
    return items;
}

export class AndoCityScraper implements Scraper {
    municipality: '安堵町' = '安堵町';

    async scrape(): Promise<BiddingItem[]> {
        return scrapeAndoCity();
    }
}

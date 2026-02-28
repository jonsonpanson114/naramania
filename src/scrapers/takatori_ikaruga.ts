import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, Scraper, Municipality } from '../types/bidding';
import { isRealBiddingItem, classifyWinner } from './common/filter';

// 高取町（Takatori-cho）
const TAKATORI_RSS = 'http://www.town.takatori.nara.jp/rss/rss.xml';

// 斑鳩町（Ikaruga-cho）
const IKARUGA_RSS = 'https://www.town.ikaruga.nara.jp/rss/rss.xml';

function classifyType(title: string): '建築' | 'コンサル' | 'その他' {
    if (title.includes('設計') || title.includes('測量') || title.includes('コンサル')) {
        return 'コンサル';
    }
    if (title.includes('建築') || title.includes('工事')) {
        return '建築';
    }
    return 'その他';
}

function parseRssDate(dateStr: string): string {
    // "Tue, 24 Feb 2026 14:50:52 +0900" → "2026-02-24"
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

async function scrapeFromRss(rssUrl: string, municipality: Municipality): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];

    try {
        // RSSフィードを取得
        const res = await axios.get(rssUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000,
        });
        const $ = cheerio.load(res.data, { xmlMode: true });

        // RSS itemの抽出
        $('item').each((i: number, el: any) => {
            const title = $(el).find('title').text().trim();
            const link = $(el).find('link').text().trim();
            const pubDate = $(el).find('pubDate').text().trim();

            if (!title || !link) return;

            // 入札・契約・落札・工事に関する項目のみ抽出（ポジティブフィルタ）
            if (!isRealBiddingItem(title)) return;

            // ステータス判定
            let status: '受付中' | '締切間近' | '受付終了' | '落札' = '受付中';
            let winningContractor = undefined;

            if (title.includes('落札') || title.includes('結果')) {
                status = '落札';
                winningContractor = title.split('：').pop()?.trim();
            } else if (title.includes('資格審査')) {
                status = '受付終了';
            }

            const announcementDate = parseRssDate(pubDate);

            items.push({
                id: `${municipality}-${link.split('=').pop()?.substring(0, 20) || i}`,
                municipality,
                title,
                type: classifyType(title),
                announcementDate,
                link,
                status,
                winningContractor,
                winnerType: classifyWinner(winningContractor || '')
            });
        });

    } catch (e: any) {
        console.error(`[${municipality}] エラー:`, e.message || e);
    }

    console.log(`[${municipality}] 合計 ${items.length} 件`);
    return items;
}

async function scrapeTakatori(): Promise<BiddingItem[]> {
    return scrapeFromRss(TAKATORI_RSS, '高取町');
}

async function scrapeIkaruga(): Promise<BiddingItem[]> {
    return scrapeFromRss(IKARUGA_RSS, '斑鳩町');
}

export class TakatoriTownScraper implements Scraper {
    municipality: '高取町' = '高取町';

    async scrape(): Promise<BiddingItem[]> {
        return scrapeTakatori();
    }
}

export class IkarugaTownScraper implements Scraper {
    municipality: '斑鳩町' = '斑鳩町';

    async scrape(): Promise<BiddingItem[]> {
        return scrapeIkaruga();
    }
}

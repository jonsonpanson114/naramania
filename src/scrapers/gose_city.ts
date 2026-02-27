import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, Scraper } from '../types/bidding';
import { shouldKeepItem, classifyWinner } from './common/filter';

// 御所市
const RSS_URL = 'https://www.city.gose.nara.jp/rss/rss.xml';

// 月別ページURL: pattern like https://www.city.gose.nara.jp/category/6-9-0-0-0-0-0-0-0-0-0-0-0.html
const MONTH_BASE = 'https://www.city.gose.nara.jp/category';

// スキップキーワード
function shouldSkip(title: string): boolean {
    return !shouldKeepItem(title, '');
}

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
    // "Fri, 21 Feb 2025 12:00:00 JST" -> "2025-02-21"
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
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
        $('item').each((i: number, el: any) => {
            const title = $(el).find('title').text().trim();
            const link = $(el).find('link').attr('href') || '';
            if (!title) return;

            if (shouldKeepItem(title, '')) {
                const winningContractor = title.includes('落札') ? title.split('：').pop()?.trim() : undefined;
                items.push({
                    id: `gose-${title.slice(0, 20)}`,
                    municipality: '御所市',
                    title,
                    type: classifyType(title),
                    announcementDate: parseRssDate(new Date().toString()), // Fallback to now for new entries
                    link: link,
                    status: title.includes('落札') ? '落札' : '受付中',
                    winningContractor: winningContractor,
                    winnerType: classifyWinner(winningContractor || '')
                });
            }
        });

    } catch (e: any) {
        console.error('[御所市] エラー:', e.message || e);
    }

    console.log(`[御所市] 合計 ${items.length} 件`);
    return items;
}

export class GoseCityScraper implements Scraper {
    municipality: '御所市' = '御所市';

    async scrape(): Promise<BiddingItem[]> {
        return scrapeGoseCity();
    }
}

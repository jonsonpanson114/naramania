import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, Scraper } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

const OYODO_URLS = [
    'https://www.town.oyodo.lg.jp/contents_detail.php?frmId=218',  // 公告
    'https://www.town.oyodo.lg.jp/contents_detail.php?frmId=1718', // 令和7年度結果
    'https://www.town.oyodo.lg.jp/contents_detail.php?frmId=1608', // 令和6年度結果
];

function extractDate(text: string): string {
    const m = text.match(/(?:令和|R)(\d+)年(\d+)月(\d+)日/);
    if (m) {
        const year = 2018 + parseInt(m[1]);
        return `${year}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }
    // Fallback: 2025-03-01 if no date found but seems recent
    return '2025-03-01'; 
}

export class OyodoTownScraper implements Scraper {
    municipality: '大淀町' = '大淀町' as const;

    async scrape(): Promise<BiddingItem[]> {
        const items: BiddingItem[] = [];
        
        for (const url of OYODO_URLS) {
            try {
                const res = await axios.get(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 15000,
                });
                const $ = cheerio.load(res.data);

                $('a').each((i, el) => {
                    const text = $(el).text().trim();
                    const href = $(el).attr('href') || '';
                    
                    if (text.length > 5 && (text.includes('入札') || text.includes('公告') || text.includes('結果') || href.includes('.pdf'))) {
                        if (!shouldKeepItem(text)) return;

                        const isResult = text.includes('結果') || url.includes('1718') || url.includes('1608');
                        const status = isResult ? '落札' : '受付中';
                        const linkUrl = href.startsWith('http') ? href : 'https://www.town.oyodo.lg.jp/' + href;
                        const date = extractDate(text);

                        items.push({
                            id: `oyodo-town-${i}-${Math.random().toString(36).slice(2, 5)}`,
                            municipality: '大淀町',
                            title: text,
                            type: '建築',
                            announcementDate: date,
                            link: linkUrl,
                            status: status,
                        });
                    }
                });

            } catch (e: unknown) {
                console.error(`[大淀町] エラー (${url}):`, e instanceof Error ? e instanceof Error ? e.message : String(e) : String(e));
            }
        }
        return items;
    }
}

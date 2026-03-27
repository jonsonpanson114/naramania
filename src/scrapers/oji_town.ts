import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, Scraper } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

const OJI_URL = 'https://www.town.oji.nara.jp/kakuka/somu/somu/gyomuannai/nyuusatu/nyuusatukouhyou/index.html';

function extractDate(text: string): string {
    const m = text.match(/(?:令和|R)(\d+)年(\d+)月(\d+)日/);
    if (m) {
        const year = 2018 + parseInt(m[1]);
        return `${year}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }
    return '2025-03-01'; // Default recent fallback
}

export class OjiTownScraper implements Scraper {
    municipality: '王寺町' = '王寺町' as const;

    async scrape(): Promise<BiddingItem[]> {
        const items: BiddingItem[] = [];
        try {
            const res = await axios.get(OJI_URL, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 15000,
            });
            const $ = cheerio.load(res.data);

            // 王寺町の構造: 一覧ページ内のリンクから抽出
            $('a').each((i, el) => {
                const text = $(el).text().trim();
                const href = $(el).attr('href') || '';
                
                // キーワードの緩和: 公告や結果だけでなく、工事・設計・業務なども含める
                if (text.length > 5 && (
                    text.includes('公告') || text.includes('結果') || text.includes('入札') ||
                    text.includes('公表') || text.includes('工事') || text.includes('設計') ||
                    text.includes('業務') || text.includes('委託')
                )) {
                    if (!shouldKeepItem(text)) return;

                    const isResult = text.includes('結果') || text.includes('公表');
                    const status = isResult ? '落札' : '受付中';
                    const linkUrl = href.startsWith('http') ? href : 'https://www.town.oji.nara.jp' + href;
                    const date = extractDate(text);

                    items.push({
                        id: `oji-town-${i}-${Math.random().toString(36).slice(2, 5)}`,
                        municipality: '王寺町',
                        title: text,
                        type: '建築',
                        announcementDate: date,
                        link: linkUrl,
                        status: status,
                    });
                }
            });

        } catch (e: unknown) {
            console.error(`[王寺町] エラー:`, e instanceof Error ? e instanceof Error ? e.message : String(e) : String(e));
        }
        return items;
    }
}

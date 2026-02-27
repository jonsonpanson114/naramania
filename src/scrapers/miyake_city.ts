import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, Scraper } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

// 三宅町入札情報ページ
// RSSフィード + HTMLで公開
const BASE_URL = 'https://www.town.miyake.lg.jp';
const RSS_URL = `${BASE_URL}/soshiki/list8-1.html`; // RSS対応ページ

// スキップキーワード
const SKIP_KEYWORDS = [
    '道路', '舗装', '下水道', '河川', '砂防', '水道', '管工事', '橋梁', '護岸',
    '側溝', '水路', '排水', 'マンホール', '配水管', '布設替', '管路', '電気通信',
    '造園', 'カルバート', '樋門', '土木', '舗装維持', '除草', 'バッテリー',
];

function shouldSkip(title: string): boolean {
    return !shouldKeepItem(title);
}

async function scrapeMiyakeCity(): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];

    try {
        // RSS対応ページへアクセス
        const res = await axios.get(RSS_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000,
        });
        const $ = cheerio.load(res.data);

        // 新着情報セクションを確認
        const newItem = $('td.new').first();
        const newItemText = newItem ? newItem.text().trim() : '';
        console.log(`[三宅町] 新着: ${newItemText}`);

        // 各項目のリンクを取得
        const links = $('a').map((i, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href') || '';
            return { text, href };
        });

        // 日付付きリンクを優先（例: 令和7年4月分）
        for (const { text, href } of links) {
            // 日付パターン: "令和X年Y月M月D日" または "YYYY/MM/DD"
            const dateMatch = text.match(/令和(\d+)年(\d+)月(\d+)日/) ||
                               text.match(/(\d{4})\/(\d{2})\/(\d{2})/);

            let announcementDate = '';
            if (dateMatch) {
                const y = dateMatch[1];
                const m = dateMatch[2];
                const d = dateMatch[3];
                announcementDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            } else {
                // RSSアイテムの場合
                announcementDate = new Date().toISOString().split('T')[0];
            }

            // 建設工事・物品・役務を判断
            const isConstruction = text.includes('工事');
            const isItem = text.includes('物品') || text.includes('役務');

            if (!isConstruction && !isItem) continue; // 工事系のみ対象
            if (shouldSkip(text)) continue;

            if (href.startsWith('http')) {
                items.push({
                    id: `miyake-${announcementDate}-${text.slice(0, 20)}`,
                    municipality: '三宅町',
                    title: text,
                    type: isConstruction ? '建築' : 'その他',
                    announcementDate,
                    link: href,
                    status: '受付中', // RSSの新着は公告と仮定
                });
            }
        }

    } catch (e: any) {
        console.error('[三宅町] エラー:', e.message || e);
    }

    console.log(`[三宅町] 合計 ${items.length} 件`);
    return items;
}

export class MiyakeCityScraper implements Scraper {
    municipality: '三宅町' = '三宅町';

    async scrape(): Promise<BiddingItem[]> {
        return scrapeMiyakeCity();
    }
}

import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, Scraper, Municipality } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

// 山添村（yamazomura）
const YAMAZO_URL = 'https://www.vill.yamazomura.nara.jp/nyusatsu.html';

// 平群町（hiragawa）
const HIRAGAWA_URL = 'https://www.vill.hiragawa.nara.jp/nyusatsu.html';

// スキップキーワード（他の小規模自治体向け）
const SKIP_KEYWORDS = [
    '道路', '舗装', '下水道', '河川', '砂防', '水道', '管工事', '橋梁', '護岸',
    '側溝', '水路', '排水', 'マンホール', '配水管', '布設替', '管路', '電気通信',
    '造園', 'カルバート', '樋門', '土木', '舗装維持', '除草', 'バッテリー', '橋', '測量', '下水道',
];

function shouldSkip(title: string): boolean {
    return !shouldKeepItem(title);
}

async function scrapeSmallTown(url: string, municipality: string): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];

    try {
        const res = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000,
        });
        const $ = cheerio.load(res.data);

        // 入札結果セクションを探す
        const resultSection = $('h2:contains("入札結果"), h3:contains("入札結果"), h4:contains("入札結果")')
            .first();

        if (!resultSection) {
            console.warn(`[${municipality}] 入札結果セクションが見つかりません`);
            return items;
        }

        const sectionTitle = resultSection.prev().text().trim();
        console.log(`[${municipality}] セクション: ${sectionTitle}`);

        // リンクテーブルまたはリンクリスト
        const rows = resultSection.next().next().find('table tr, ul li').toArray();

        for (const element of rows) {
            const row = $(element);
            const link = row.find('a').first();
            const title = link ? link.text().trim().replace(/\s+/g, ' ') : '';

            if (!title) continue;
            if (shouldSkip(title)) continue;

            const href = link ? link.attr('href') || '' : '';

            items.push({
                id: `${municipality}-${title.slice(0, 20)}`,
                municipality: municipality as Municipality,
                title,
                type: '建築',
                announcementDate: new Date().toISOString().split('T')[0],
                link: href.startsWith('http') ? href : `https://www.vill.${municipality.toLowerCase()}.nara.jp${href}`,
                status: '落札',
                winnerType: 'ゼネコン',
            });
        }

    } catch (e: any) {
        console.error(`[${municipality}] エラー:`, e.message || e);
    }

    console.log(`[${municipality}] 合計 ${items.length} 件`);
    return items;
}

export class YamazomuraScraper implements Scraper {
    municipality: '山添村' = '山添村';

    async scrape(): Promise<BiddingItem[]> {
        return scrapeSmallTown(YAMAZO_URL, '山添村');
    }
}

export class HiragawaScraper implements Scraper {
    municipality: '平群町' = '平群町';

    async scrape(): Promise<BiddingItem[]> {
        return scrapeSmallTown(HIRAGAWA_URL, '平群町');
    }
}

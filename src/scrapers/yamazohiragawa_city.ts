import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, Scraper, Municipality } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

// 山添村（yamazoe） - 入札情報ページなし
const YAMAZO_URL = '';  // 404エラー: オンラインでの入札情報公開なし

// 平群町（heguri）
const HEGURI_URL = 'https://www.town.heguri.nara.jp/soshiki/list7-1.html';

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

    if (!url) {
        console.log(`[${municipality}] URLが設定されていません`);
        return items;
    }

    try {
        const res = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000,
        });
        const $ = cheerio.load(res.data);

        // 平群町のページ構造: <li class="article_item"><span class="article_title"><a href="...">Title</a></span>...</li>
        const articleItems = $('.article_item, .article_title').closest('li').toArray();
        for (const element of articleItems) {
            const row = $(element);
            const linkEl = row.find('.article_title a, a').first();
            const title = linkEl ? linkEl.text().trim().replace(/\s+/g, ' ') : '';
            if (!title || title === '本文へ' || title === '拡大' || title === 'サイトマップ') continue;
            if (shouldSkip(title)) continue;

            const hrefVal = linkEl ? linkEl.attr('href') : '';
            if (!hrefVal) continue;

            // 入札結果と入札公告を分類
            const isResult = title.includes('開札結果') || title.includes('落札');
            const status = isResult ? '落札' : '受付中';

            const itemId = municipality + '-' + title.slice(0, 20);
            const linkUrl = hrefVal.startsWith('http') ? hrefVal : 'https://www.town.heguri.nara.jp' + hrefVal;

            items.push({
                id: itemId,
                municipality: municipality as Municipality,
                title: title,
                type: '建築',
                announcementDate: new Date().toISOString().split('T')[0],
                link: linkUrl,
                status: status,
                winnerType: isResult ? 'ゼネコン' : undefined,
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
        console.log('[山添村] 入札情報ページなし（オンライン公開なし）');
        return [];
    }
}

export class HiragawaScraper implements Scraper {
    municipality: '平群町' = '平群町';

    async scrape(): Promise<BiddingItem[]> {
        return scrapeSmallTown(HEGURI_URL, '平群町');
    }
}

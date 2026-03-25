import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, Scraper, Municipality } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

// 平群町（heguri）
const HEGURI_URL = 'https://www.town.heguri.nara.jp/soshiki/list7-1.html';

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

        // 平群町：入札情報ページのリンクのみを対象とする
        // ナビゲーション・インフォリンクなどを除外する厳格なフィルタ適用
        const NON_BIDDING_NAV = [
            '地図でさがす', 'くらしの情報', 'しごとの情報', '観光情報', '町政情報',
            '本文へ', 'ご利用ガイド', 'サイトマップ', 'Foreign language', '拡大',
            '組織でさがす', 'カレンダーでさがす', 'リンク・著作権', '個人情報保護',
            'アクセシビリティ', '広告バナー', '町役場へのアクセス', 'メールでのお問い合わせ',
            '入札参加資格', '申請', '入札について',
        ];

        const articleItems = $('a').toArray();
        for (const element of articleItems) {
            const linkEl = $(element);
            const title = linkEl.text().trim().replace(/\s+/g, ' ');
            if (!title || title.length < 6) continue;
            if (NON_BIDDING_NAV.some(kw => title.includes(kw))) continue;

            // 入札・工事・設計・委託・修繕・改修・解体を含むものだけ通す
            const POSITIVE = ['入札', '公告', '工事', '設計', '委託', '修繕', '改修', '解体', '開札結果', '落札'];
            if (!POSITIVE.some(kw => title.includes(kw))) continue;

            if (!shouldKeepItem(title)) continue;

            const hrefVal = linkEl.attr('href') || '';
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

    } catch (e: unknown) {
        console.error(`[${municipality}] エラー:`, e instanceof Error ? e instanceof Error ? e.message : String(e) : String(e));
    }

    console.log(`[${municipality}] 合計 ${items.length} 件`);
    return items;
}

export class YamazomuraScraper implements Scraper {
    municipality: '山添村' = '山添村' as const;

    async scrape(): Promise<BiddingItem[]> {
        console.log('[山添村] 入札情報ページなし（オンライン公開なし）');
        return [];
    }
}

export class HiragawaScraper implements Scraper {
    municipality: '平群町' = '平群町' as const;

    async scrape(): Promise<BiddingItem[]> {
        return scrapeSmallTown(HEGURI_URL, '平群町');
    }
}

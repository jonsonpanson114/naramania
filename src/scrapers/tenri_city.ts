import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

// 天理市 入札情報
// 入札公告: 1ページに全案件の案件概要テーブルが埋め込まれた静的HTML
// 入札結果: PDFのみ → スキップ
const BASE = 'https://www.city.tenri.nara.jp';
const ANNOUNCE_URL = `${BASE}/kakuka/soumubu/nyuusatsushinsashitsu/construction_work/kouji_hattyuu_kanren/1395887232147.html`;

const SKIP_KEYWORDS = [
    '廃棄物', 'ごみ', '物品', '車両', '清掃', '警備', '下水', '管渠',
    '舗装', '土木', '河川', '造園', '電気通信', '水道施設', 'システム',
    '農業', '橋梁',
];
const SKIP_TYPES = ['土木工事', '管工事', '電気工事', '電気通信工事', '舗装工事'];

function classifyType(title: string, type: string): BiddingType {
    const t = title + type;
    if (t.includes('設計') || t.includes('測量') || t.includes('コンサル')) return 'コンサル';
    if (t.includes('委託') || t.includes('業務')) return '委託';
    return '建築';
}

function makeId(title: string): string {
    return `tenri-${crypto.createHash('md5').update(title).digest('hex').slice(0, 8)}`;
}

function parseJapaneseDate(text: string): string {
    const m = text.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (m) {
        const year = 2018 + parseInt(m[1]);
        return `${year}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }
    return '';
}

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; naramania-scraper/1.0)' };

export class TenriCityScraper implements Scraper {
    municipality: '天理市' = '天理市';

    async scrape(): Promise<BiddingItem[]> {
        const allItems: BiddingItem[] = [];
        console.log('[天理市] 入札公告 取得中...');

        try {
            const res = await axios.get(ANNOUNCE_URL, { timeout: 20000, headers: HEADERS });
            const $ = cheerio.load(res.data);

            // caption="案件概要" のテーブルを全て処理
            $('table').each((_, tbl) => {
                const caption = $(tbl).find('caption').text().trim();
                if (caption !== '案件概要') return;

                // key-value テーブルをパース
                const kv: Record<string, string> = {};
                $(tbl).find('tr').each((_, row) => {
                    const cells = $(row).find('td');
                    if (cells.length >= 2) {
                        const key = cells.eq(0).text().trim();
                        const val = cells.eq(1).text().trim().replace(/\s+/g, ' ');
                        if (key) kv[key] = val;
                    }
                });

                const title = kv['工事名'] || kv['業務名'] || kv['件名'] || '';
                const annoDateText = kv['公告日'] || kv['告示日'] || '';
                const type = kv['工事種別'] || kv['業種'] || '';

                if (!title) return;
                if (shouldSkip(title, type)) return;

                const annoDate = parseJapaneseDate(annoDateText) || new Date().toISOString().split('T')[0];

                // 近隣のPDFリンク
                const pdfHref = $(tbl).find('a[href*=".pdf"]').first().attr('href')
                    || $(tbl).parent().find('a[href*=".pdf"]').first().attr('href') || '';
                const pdfUrl = pdfHref ? (pdfHref.startsWith('//') ? `https:${pdfHref}` : pdfHref) : undefined;

                allItems.push({
                    id: makeId(title),
                    municipality: '天理市',
                    title,
                    type: classifyType(title, type),
                    announcementDate: annoDate,
                    link: ANNOUNCE_URL,
                    pdfUrl,
                    status: '受付中',
                });
            });

            console.log(`[天理市] 入札公告: ${allItems.length}件`);
        } catch (e: any) {
            console.error('[天理市] スクレイパーエラー:', e.message || e);
        }

        console.log(`[天理市] 合計 ${allItems.length} 件`);
        return allItems;
    }
}

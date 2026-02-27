import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

// 葛城市 入札情報（静的HTMLテーブル）
const BASE = 'https://www.city.katsuragi.nara.jp';
const ANNOUNCE_URL = `${BASE}/soshiki/kanzaika/2/1637.html`;

// テーブル構造: 番号 | 業務名（PDFリンク）| 所管課 | 告示日 | 備考

const INCLUDE_KEYWORDS = [
    '工事', '設計', '改修', '修繕', '新築', '建設', '解体', '建築',
    '測量', '点検', '耐震', '監理', '計画', '補修', '整備', '施設',
];
const SKIP_KEYWORDS = [
    '廃棄物', '焼却', 'ごみ', 'リサイクル', '売払', '物品', '車両',
    '清掃', '警備', '農業', '道路', '橋梁', '下水', '管渠', '舗装',
    '土木', '河川', '造園', '電気通信', '水道施設', 'システム',
];

function titleSeemsRelevant(title: string): boolean {
    return shouldKeepItem(title);
}

function classifyType(title: string): BiddingType {
    if (title.includes('設計') || title.includes('測量') || title.includes('コンサル')) return 'コンサル';
    if (title.includes('委託') || title.includes('業務') || title.includes('管理')) return '委託';
    return '建築';
}

function makeId(title: string): string {
    return `katsuragi-${crypto.createHash('md5').update(title).digest('hex').slice(0, 8)}`;
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

export class KatsuragiCityScraper implements Scraper {
    municipality: '葛城市' = '葛城市';

    async scrape(): Promise<BiddingItem[]> {
        const allItems: BiddingItem[] = [];
        console.log('[葛城市] 入札公告 取得中...');

        try {
            const res = await axios.get(ANNOUNCE_URL, { timeout: 20000, headers: HEADERS });
            const $ = cheerio.load(res.data);

            $('table tr').each((i, row) => {
                const cells = $(row).find('td');
                if (cells.length < 4) return;

                const numText = cells.eq(0).text().trim();
                // 番号列が数字でなければヘッダー行
                if (!/^\d+$/.test(numText)) return;

                const titleEl = cells.eq(1);
                // aタグのテキストのみ（PDFファイルサイズ情報等を除外）
                const title = (titleEl.find('a').first().text().trim() || titleEl.text().trim())
                    .replace(/\(PDFファイル:[^)]*\)/g, '').replace(/\s+/g, ' ').trim();
                const pdfHref = titleEl.find('a').attr('href') || '';
                const dept = cells.eq(2).text().trim();
                const dateText = cells.eq(3).text().trim();

                if (!title || !titleSeemsRelevant(title)) return;

                const annoDate = parseJapaneseDate(dateText) || new Date().toISOString().split('T')[0];
                const pdfUrl = pdfHref ? (pdfHref.startsWith('//') ? `https:${pdfHref}` : pdfHref) : undefined;

                allItems.push({
                    id: makeId(title),
                    municipality: '葛城市',
                    title,
                    type: classifyType(title + dept),
                    announcementDate: annoDate,
                    link: pdfUrl || ANNOUNCE_URL,
                    pdfUrl,
                    status: '受付中',
                });
            });

            console.log(`[葛城市] 入札公告: ${allItems.length}件`);
        } catch (e: any) {
            console.error('[葛城市] スクレイパーエラー:', e.message || e);
        }

        console.log(`[葛城市] 合計 ${allItems.length} 件`);
        return allItems;
    }
}

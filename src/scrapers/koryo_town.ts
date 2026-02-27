import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

const BASE_URL = 'https://www.town.koryo.nara.jp';
// 指名競争入札結果カテゴリページ
const CATEGORY_URL = `${BASE_URL}/category/19-4-2-0-0-0-0-0-0-0.html`;

// スキップする工種キーワード
const SKIP_KEYWORDS = [
    '道路', '舗装', '下水道', '河川', '砂防', '水道', '管工事', '電気通信',
    '造園', '機械', '橋梁', 'カルバート', '高木', '剪定', '植樹', '護岸',
    '側溝', '水路', '調整池', 'ため池', '排水', '土木', '管渠', '維持工事',
    '鋼構造', '用水路', '農業用水',
    // 広陵町固有
    '歩道橋', '管路', '里道', 'バイパス', '樋門', '古墳', '史跡',
    '伐倒', '発掘調査', '遊具', '補償調査',
];

function shouldSkip(title: string): boolean {
    return !shouldKeepItem(title);
}

function classifyType(section: string, title: string): BiddingType {
    if (section.includes('測量') || section.includes('設計') || section.includes('コンサル')) {
        return 'コンサル';
    }
    if (title.includes('設計') || title.includes('測量') || title.includes('コンサル')) {
        return 'コンサル';
    }
    return '建築';
}

// "No3 案件名（5月13日開札）" → { no: '3', name: '案件名', date: '2025-05-13' }
function parseItem(text: string): { no: string; name: string; date: string } | null {
    const m = text.match(/^No(\d+)\s+(.+?)（(\d+)月(\d+)日開札）/);
    if (!m) return null;
    const no = m[1];
    const name = m[2].trim();
    const month = parseInt(m[3]);
    const day = parseInt(m[4]);
    const year = month >= 4 ? 2025 : 2026;
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { no, name, date };
}

export class KoryoTownScraper implements Scraper {
    municipality: '広陵町' = '広陵町';

    async scrape(): Promise<BiddingItem[]> {
        const items: BiddingItem[] = [];

        try {
            // カテゴリページから今年度URLを動的取得
            const catRes = await axios.get(CATEGORY_URL, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 15000,
            });
            const $cat = cheerio.load(catRes.data);

            let yearUrl = '';
            $cat('a[href]').each((_, el) => {
                if (yearUrl) return;
                const href = $cat(el).attr('href') || '';
                const text = $cat(el).text().trim();
                if (text.includes('令和') && text.includes('指名競争入札結果')) {
                    yearUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
                }
            });

            if (!yearUrl) {
                console.warn('[広陵町] 指名競争入札結果URLが見つかりません');
                return items;
            }
            console.log(`[広陵町] URL: ${yearUrl}`);

            const res = await axios.get(yearUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 15000,
            });
            const $ = cheerio.load(res.data);

            // div.mol_attachfileblock ブロック単位でセクション + liを処理
            $('div.mol_attachfileblock').each((_, block) => {
                const sectionTitle = $(block).find('p.mol_attachfileblock_title').text().trim();
                if (!sectionTitle.includes('入札結果')) return;

                $(block).find('ul li').each((_, li) => {
                    const text = $(li).text().replace(/\s+/g, ' ').trim();
                    if (!text) return;

                    const parsed = parseItem(text);
                    if (!parsed) return;
                    const { no, name, date } = parsed;
                    if (!name) return;
                    if (shouldSkip(name)) return;

                    const pdfHref = $(li).find('a').attr('href') || '';
                    const link = pdfHref
                        ? (pdfHref.startsWith('http') ? pdfHref : `${BASE_URL}/${pdfHref.replace(/^\.\//, '')}`)
                        : yearUrl;

                    items.push({
                        id: `koryo-${date}-No${no}`,
                        municipality: '広陵町',
                        title: name,
                        type: classifyType(sectionTitle, name),
                        announcementDate: date,
                        biddingDate: date,
                        link,
                        status: '落札',
                    });
                });
            });

        } catch (e: any) {
            console.error('[広陵町] エラー:', e.message || e);
        }

        console.log(`[広陵町] 合計 ${items.length} 件`);
        return items;
    }
}

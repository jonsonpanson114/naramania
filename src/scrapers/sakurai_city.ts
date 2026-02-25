import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';

// 桜井市 入札情報（静的HTMLテーブル、axios+cheerio）
// テーブル構造: 区分 | 工事（委託）名 | 場所 | 業種・ランク等
const BASE = 'https://www.city.sakurai.lg.jp';
const ANNOUNCE_URL = `${BASE}/sosiki/soumu/kanzaikeiyaku/nyuusatukeiyakukensa/6596.html`;
// 入札結果はEPI-Cloudへのリンクのみ → スキップ

const SKIP_GYOSHU = [
    '土木', '管渠', '舗装', '下水', '河川', '造園', '電気通信', '水道',
    '農業', '橋梁',
];
const SKIP_TITLE = [
    '廃棄物', '物品', '車両', '清掃', '警備', 'システム',
];

function shouldSkip(title: string, gyoshu: string): boolean {
    return SKIP_GYOSHU.some(kw => gyoshu.includes(kw) || title.includes(kw))
        || SKIP_TITLE.some(kw => title.includes(kw));
}

function classifyType(title: string, gyoshu: string): BiddingType {
    const t = title + gyoshu;
    if (t.includes('設計') || t.includes('測量') || t.includes('コンサル')) return 'コンサル';
    if (t.includes('委託') || t.includes('業務')) return '委託';
    return '建築';
}

function makeId(title: string): string {
    return `sakurai-${crypto.createHash('md5').update(title).digest('hex').slice(0, 8)}`;
}

// h3見出しから日付を抽出: "X月Y日公告" 形式
// 令和7年度 = 2025年4月〜2026年3月 → 4〜12月は2025年, 1〜3月は2026年
function parseDateFromHeading(heading: string): string {
    const m = heading.match(/(\d+)月(\d+)日/);
    if (!m) return new Date().toISOString().split('T')[0];
    const month = parseInt(m[1]);
    const day = parseInt(m[2]);
    const year = month >= 4 ? 2025 : 2026;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; naramania-scraper/1.0)' };

export class SakuraiCityScraper implements Scraper {
    municipality: '桜井市' = '桜井市';

    async scrape(): Promise<BiddingItem[]> {
        const allItems: BiddingItem[] = [];
        console.log('[桜井市] 入札公告 取得中...');

        try {
            const res = await axios.get(ANNOUNCE_URL, { timeout: 20000, headers: HEADERS });
            const $ = cheerio.load(res.data);

            // テーブルの直前のh3見出し（日付）を追跡
            let currentDate = new Date().toISOString().split('T')[0];

            // h3とtableを順に処理
            $('h3, table').each((_, el) => {
                if (el.tagName === 'h3') {
                    const text = $(el).text().trim();
                    const d = parseDateFromHeading(text);
                    if (d) currentDate = d;
                    return;
                }
                if (el.tagName !== 'table') return;

                // テーブルヘッダーの確認（区分|工事名|場所|業種）
                const rows = $(el).find('tr').toArray();
                if (rows.length < 2) return;
                const headers = $(rows[0]).find('th, td').map((_, c) => $(c).text().trim()).toArray();
                const titleIdx = headers.findIndex(h => h.includes('工事') || h.includes('委託') || h.includes('業務名'));
                const gyoshuIdx = headers.findIndex(h => h.includes('業種') || h.includes('ランク'));

                if (titleIdx < 0) return;

                for (let i = 1; i < rows.length; i++) {
                    const cells = $(rows[i]).find('td').map((_, c) => $(c).text().replace(/\s+/g, ' ').trim()).toArray();
                    if (cells.length <= titleIdx) continue;

                    const title = cells[titleIdx]?.trim();
                    const gyoshu = gyoshuIdx >= 0 ? (cells[gyoshuIdx] || '') : '';

                    if (!title || title.length < 4) continue;
                    if (shouldSkip(title, gyoshu)) continue;

                    allItems.push({
                        id: makeId(title),
                        municipality: '桜井市',
                        title,
                        type: classifyType(title, gyoshu),
                        announcementDate: currentDate,
                        link: ANNOUNCE_URL,
                        status: '受付中',
                    });
                }
            });

            console.log(`[桜井市] 入札公告: ${allItems.length}件`);
        } catch (e: any) {
            console.error('[桜井市] スクレイパーエラー:', e.message || e);
        }

        console.log(`[桜井市] 合計 ${allItems.length} 件`);
        return allItems;
    }
}

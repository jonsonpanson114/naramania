import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

const ANNOUNCE_URL = 'https://www.city.sakurai.lg.jp/sosiki/soumu/kanzaikeiyaku/nyuusatukeiyakukensa/6596.html';

// スキップする業種キーワード
const SKIP_KEYWORDS = ['土木', '舗装', '管渠', '下水道', '道路', '河川', '砂防', '水道', '管工事', '電気通信', '造園', '機械'];

function shouldSkip(title: string, category: string): boolean {
    return !shouldKeepItem(title, category);
}

function classifyType(category: string): BiddingType {
    if (category.includes('委託') || category.includes('業務') || category.includes('コンサル') || category.includes('設計')) return 'コンサル';
    return '建築';
}

// h3 見出しから日付を取得: 「X月Y日公告」→ YYYY-MM-DD
function parseDateFromHeading(heading: string): string {
    const m = heading.match(/(\d+)月(\d+)日/);
    if (!m) return new Date().toISOString().split('T')[0];
    const month = parseInt(m[1]);
    const day = parseInt(m[2]);
    const year = month >= 4 ? 2025 : 2026;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export class SakuraiCityScraper implements Scraper {
    municipality: '桜井市' = '桜井市';

    async scrape(): Promise<BiddingItem[]> {
        const items: BiddingItem[] = [];

        try {
            const res = await axios.get(ANNOUNCE_URL, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 15000,
            });
            const $ = cheerio.load(res.data);

            // h3 見出しを順に処理
            $('h3').each((_, h3El) => {
                const h3Text = $(h3El).text().trim();
                const annoDate = parseDateFromHeading(h3Text);

                // h3 の次の table を取得
                const table = $(h3El).nextAll('table, div.wysiwyg').first();
                const actualTable = table.is('table') ? table : table.find('table').first();
                if (!actualTable.length) return;

                actualTable.find('tbody tr').each((rowIdx, tr) => {
                    const tds = $(tr).find('td');
                    if (tds.length < 2) return;

                    const category = $(tds[0]).text().trim(); // 区分（工事/委託）
                    const title = $(tds[1]).text().replace(/\s+/g, ' ').trim();    // 工事（委託）名
                    const location = tds.length > 2 ? $(tds[2]).text().trim() : '';
                    const koushu = tds.length > 3 ? $(tds[3]).text().trim() : '';

                    // ヘッダー行スキップ
                    if (!title || category === '区分' || title === '工事（委託）名') return;
                    // スキップ判定
                    if (shouldSkip(title, koushu)) return;

                    const id = `sakurai-${annoDate}-${title.slice(0, 30)}`.replace(/\s+/g, '-');
                    items.push({
                        id,
                        municipality: '桜井市',
                        title,
                        type: classifyType(category + koushu),
                        announcementDate: annoDate,
                        link: ANNOUNCE_URL,
                        status: '受付中',
                        ...(location ? { description: location } : {}),
                    });
                });
            });

        } catch (e: any) {
            console.error('[桜井市] エラー:', e.message || e);
        }

        console.log(`[桜井市] 合計 ${items.length} 件`);
        return items;
    }
}

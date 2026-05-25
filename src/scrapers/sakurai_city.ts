import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

const ANNOUNCE_URL = 'https://www.city.sakurai.lg.jp/sosiki/soumu/kanzaikeiyaku/nyuusatukeiyakukensa/notice/6596.html';

function shouldSkip(title: string, category: string): boolean {
    return !shouldKeepItem(title, category);
}

function classifyType(category: string): BiddingType {
    if (category.includes('委託') || category.includes('業務') || category.includes('コンサル') || category.includes('設計')) return 'コンサル';
    return '建築';
}

function parseDate(text: string): string {
    const western = text.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日/);
    if (western) {
        return `${western[1]}-${western[2].padStart(2, '0')}-${western[3].padStart(2, '0')}`;
    }
    const reiwa = text.match(/令和\s*(\d+)\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (reiwa) {
        const year = 2018 + Number(reiwa[1]);
        return `${year}-${reiwa[2].padStart(2, '0')}-${reiwa[3].padStart(2, '0')}`;
    }
    const md = text.match(/(\d{1,2})月(\d{1,2})日/);
    if (md) {
        const now = new Date();
        const month = Number(md[1]);
        const year = month >= 4 ? now.getFullYear() : now.getFullYear() + 1;
        return `${year}-${String(month).padStart(2, '0')}-${String(Number(md[2])).padStart(2, '0')}`;
    }
    return '';
}

export class SakuraiCityScraper implements Scraper {
    municipality: '桜井市' = '桜井市' as const;

    async scrape(): Promise<BiddingItem[]> {
        const items: BiddingItem[] = [];

        try {
            const res = await axios.get(ANNOUNCE_URL, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 20000,
            });
            const $ = cheerio.load(res.data);
            const pageDate = parseDate($.text());
            const currentSectionHeading = $('h3').first().text().trim();
            const annoDate = parseDate(currentSectionHeading) || pageDate;
            const actualTable = $('table').first();

            actualTable.find('tr').each((_, tr) => {
                const tds = $(tr).find('td');
                if (tds.length < 2) return;

                const category = $(tds[0]).text().trim();
                const title = $(tds[1]).text().replace(/\s+/g, ' ').trim();
                const location = tds.length > 2 ? $(tds[2]).text().trim() : '';
                const koushu = tds.length > 3 ? $(tds[3]).text().trim() : '';

                if (!title || category === '区分' || title === '工事（委託）名') return;
                if (shouldSkip(title, `${category} ${koushu}`)) return;

                const id = `sakurai-${annoDate}-${title}`.normalize('NFKC').replace(/[^\w\u3040-\u30ff\u3400-\u9fff-]+/g, '-').slice(0, 120);
                items.push({
                    id,
                    municipality: '桜井市',
                    title,
                    type: classifyType(`${category} ${koushu}`),
                    announcementDate: annoDate,
                    link: ANNOUNCE_URL,
                    status: '受付中',
                    ...(location ? { description: location } : {}),
                });
            });
        } catch (e: unknown) {
            console.error('[桜井市] エラー:', e instanceof Error ? e.message : String(e));
        }

        console.log(`[桜井市] 合計 ${items.length} 件`);
        return items;
    }
}

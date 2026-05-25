import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
import { shouldKeepItem } from './common/filter';
import { parseJapaneseDateToIso } from './common/pdf_text';

const ANNOUNCE_URL = 'https://www.city.sakurai.lg.jp/sosiki/soumu/kanzaikeiyaku/nyuusatukeiyakukensa/notice/6596.html';
const SUPPLEMENTAL_URLS = [
    'https://www.city.sakurai.lg.jp/sosiki/kodomokateibu/kodomoseisakuka/kodomoen/8700.html',
    'https://www.city.sakurai.lg.jp/sosiki/kyouikuiinkaijimukyoku/soumuka/teianbosyuukoubo/9608.html',
];

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

function parseSupplementalBiddingDate(text: string): string | undefined {
    const patterns = [
        /(?:プレゼンテーション・ヒアリング実施|開札日|入札日|選定委員会開催日)[：:\s]*((?:20\d{2}|令和\s*\d+)\s*年\s*\d+\s*月\s*\d+\s*日)/u,
        /(?:プレゼンテーション・ヒアリング実施|開札日|入札日|選定委員会開催日)[^\n\r]*?((?:20\d{2}|令和\s*\d+)\s*年\s*\d+\s*月\s*\d+\s*日)/u,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        const iso = match ? parseJapaneseDateToIso(match[1]) : '';
        if (iso) return iso;
    }

    return undefined;
}

async function scrapeSupplementalPages(): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];

    for (const url of SUPPLEMENTAL_URLS) {
        try {
            const res = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 20000,
            });
            const $ = cheerio.load(res.data);
            const title = $('h1').first().text().replace(/\s+/g, ' ').trim();
            const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
            if (!title || !shouldKeepItem(title, bodyText)) continue;

            const announcementDate = parseDate(bodyText) || new Date().toISOString().split('T')[0];
            const biddingDate = parseSupplementalBiddingDate(bodyText);
            const status = /受託候補者|選定結果|契約候補者/u.test(bodyText) ? '落札' : '受付中';

            items.push({
                id: `sakurai-supplemental-${title}`.normalize('NFKC').replace(/[^\w\u3040-\u30ff\u3400-\u9fff-]+/g, '-').slice(0, 120),
                municipality: '桜井市',
                title,
                type: classifyType(bodyText),
                announcementDate,
                biddingDate,
                link: url,
                status,
            });
        } catch (error) {
            console.warn('[桜井市] 補助ページ取得エラー:', error instanceof Error ? error.message : String(error));
        }
    }

    return items;
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

        const supplementalItems = await scrapeSupplementalPages();
        for (const item of supplementalItems) {
            if (!items.some(existing => existing.title === item.title)) {
                items.push(item);
            }
        }

        console.log(`[桜井市] 合計 ${items.length} 件`);
        return items;
    }
}

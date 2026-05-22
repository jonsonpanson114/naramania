import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

const SANGO_INDEX = 'https://www.town.sango.nara.jp/soshiki/list8-1.html';
const SANGO_CONTRACT = 'https://www.town.sango.nara.jp/soshiki/4/13385.html';
const BASE_URL = 'https://www.town.sango.nara.jp';
const HEADERS = { 'User-Agent': 'Mozilla/5.0' };

function makeAbsoluteUrl(href: string): string {
    if (!href) return SANGO_INDEX;
    if (href.startsWith('http')) return href;
    return `${BASE_URL}${href}`;
}

function parseDate(text: string): string {
    const jp = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (jp) {
        return `${jp[1]}-${jp[2].padStart(2, '0')}-${jp[3].padStart(2, '0')}`;
    }

    const reiwa = text.match(/令和\s*(\d+)年\s*(\d+)月\s*(\d+)日/);
    if (reiwa) {
        const year = 2018 + parseInt(reiwa[1], 10);
        return `${year}-${reiwa[2].padStart(2, '0')}-${reiwa[3].padStart(2, '0')}`;
    }

    return '';
}

function parseUpdatedDate(html: string): string {
    const updated = html.match(/更新日[:：]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (updated) {
        return `${updated[1]}-${updated[2].padStart(2, '0')}-${updated[3].padStart(2, '0')}`;
    }
    return '';
}

function classifyType(title: string): BiddingType {
    if (title.includes('設計') || title.includes('監理') || title.includes('アドバイザリー')) return 'コンサル';
    if (title.includes('委託') || title.includes('業務')) return '委託';
    return '建築';
}

export class SangoTownScraper implements Scraper {
    municipality: '三郷町' = '三郷町' as const;

    async scrape(): Promise<BiddingItem[]> {
        const items = new Map<string, BiddingItem>();

        try {
            const [indexRes, contractRes] = await Promise.all([
                axios.get(SANGO_INDEX, { headers: HEADERS, timeout: 15000 }),
                axios.get(SANGO_CONTRACT, { headers: HEADERS, timeout: 15000 }),
            ]);

            const $index = cheerio.load(indexRes.data);
            const $contract = cheerio.load(contractRes.data);

            // 最新の入札一覧ページから、現在募集中のリンクを拾う。
            $index('a').each((_, el) => {
                const title = $index(el).text().trim();
                const href = $index(el).attr('href') || '';
                if (!title || !href) return;
                if (!title.includes('入札')) return;
                if (!shouldKeepItem(title)) return;

                const link = makeAbsoluteUrl(href);
                const date = parseDate(title) || parseUpdatedDate(indexRes.data);
                const id = `sango-open-${Buffer.from(link).toString('base64').slice(0, 12)}`;

                items.set(id, {
                    id,
                    municipality: '三郷町',
                    title,
                    type: classifyType(title),
                    announcementDate: date,
                    link,
                    status: '受付中',
                });
            });

            // 契約状況一覧から落札済み案件を拾う。
            $contract('a').each((_, el) => {
                const title = $contract(el).parent().next().text().replace(/\s+/g, ' ').trim();
                const href = $contract(el).attr('href') || '';
                if (!title || !href) return;
                if (!shouldKeepItem(title)) return;

                const link = makeAbsoluteUrl(href);
                const id = `sango-result-${Buffer.from(link).toString('base64').slice(0, 12)}`;
                const sectionText = $contract(el).closest('section, div, article, li, tr').text();
                const date = parseDate(sectionText) || parseUpdatedDate(contractRes.data);

                items.set(id, {
                    id,
                    municipality: '三郷町',
                    title,
                    type: classifyType(title),
                    announcementDate: date,
                    link,
                    status: '落札',
                });
            });

        } catch (error: unknown) {
            console.error('[三郷町] エラー:', error instanceof Error ? error.message : String(error));
        }

        const result = Array.from(items.values()).sort((a, b) => b.announcementDate.localeCompare(a.announcementDate));
        console.log(`[三郷町] 合計 ${result.length} 件`);
        return result;
    }
}

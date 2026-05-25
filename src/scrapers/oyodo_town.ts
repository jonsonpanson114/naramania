import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

const OYODO_URLS = [
    { url: 'https://www.town.oyodo.lg.jp/contents_detail.php?frmId=218', status: '受付中' as const },
    { url: 'https://www.town.oyodo.lg.jp/0000001945.html', status: '落札' as const },
    { url: 'https://www.town.oyodo.lg.jp/contents_detail.php?frmId=1718', status: '落札' as const },
];

const BASE_URL = 'https://www.town.oyodo.lg.jp';
const HEADERS = { 'User-Agent': 'Mozilla/5.0' };

function makeAbsoluteUrl(href: string): string {
    if (!href) return BASE_URL;
    if (href.startsWith('http')) return href;
    return `${BASE_URL}/${href.replace(/^\//, '')}`;
}

function parseJapaneseDate(text: string): string {
    const reiwa = text.match(/令和\s*(\d+)年\s*(\d+)月\s*(\d+)日/);
    if (reiwa) {
        const year = 2018 + parseInt(reiwa[1], 10);
        return `${year}-${reiwa[2].padStart(2, '0')}-${reiwa[3].padStart(2, '0')}`;
    }

    const western = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (western) {
        return `${western[1]}-${western[2].padStart(2, '0')}-${western[3].padStart(2, '0')}`;
    }

    return '';
}

function parseUpdatedDate(html: string): string {
    const match = html.match(/\[(\d{4})年(\d{1,2})月(\d{1,2})日\]/);
    if (!match) return '';
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function cleanTitle(text: string): string {
    return text
        .replace(/〖令和.*?公告〗/g, '')
        .replace(/〖令和.*?執行.*?〗/g, '')
        .replace(/（ファイル名：.*$/g, '')
        .replace(/\[PDF.*$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function classifyType(title: string): BiddingType {
    if (title.includes('設計') || title.includes('コンサル') || title.includes('アドバイザリー')) return 'コンサル';
    if (title.includes('委託') || title.includes('業務')) return '委託';
    return '建築';
}

function parseOyodoAnnouncementTables($: cheerio.CheerioAPI): BiddingItem[] {
    const items: BiddingItem[] = [];

    $('table caption').each((_, captionEl) => {
        const caption = $(captionEl).text().trim();
        const title = cleanTitle(caption.replace(/^【令和.*?】/, '').trim());
        if (!title || !shouldKeepItem(title)) return;

        const table = $(captionEl).closest('table');
        const row = table.find('tbody tr').eq(1);
        const cells = row.find('td');
        if (cells.length < 5) return;

        const announcementDate = parseJapaneseDate(cells.eq(0).text()) || parseJapaneseDate(caption);
        const gyoshu = cells.eq(1).text().trim();
        const bodyTitle = cleanTitle(cells.eq(2).text().trim()) || title;
        const place = cells.eq(4).text().trim();
        const finalTitle = bodyTitle || title;
        if (!shouldKeepItem(finalTitle, `${gyoshu} ${place}`)) return;

        const pdfHref = table.parent().nextAll('div').find('a[href$=\".pdf\"]').first().attr('href') || '';
        const pdfUrl = pdfHref ? makeAbsoluteUrl(pdfHref) : undefined;
        const id = `oyodo-${Buffer.from(`${finalTitle}|${announcementDate}`).toString('base64').slice(0, 12)}`;

        items.push({
            id,
            municipality: '大淀町',
            title: finalTitle,
            type: classifyType(`${finalTitle} ${gyoshu}`),
            announcementDate,
            link: pdfUrl || 'https://www.town.oyodo.lg.jp/0000000218.html',
            pdfUrl,
            status: '受付中',
        });
    });

    return items;
}

export class OyodoTownScraper implements Scraper {
    municipality: '大淀町' = '大淀町' as const;

    async scrape(): Promise<BiddingItem[]> {
        const items = new Map<string, BiddingItem>();

        for (const source of OYODO_URLS) {
            try {
                const res = await axios.get(source.url, {
                    headers: HEADERS,
                    timeout: 15000,
                });
                const $ = cheerio.load(res.data);
                const pageDate = parseUpdatedDate(res.data) || parseJapaneseDate($.text());

                if (source.status === '受付中') {
                    for (const item of parseOyodoAnnouncementTables($)) {
                        items.set(item.id, item);
                    }
                    continue;
                }

                $('a').each((_, el) => {
                    const rawText = $(el).text().trim();
                    const href = $(el).attr('href') || '';
                    if (!rawText || !href) return;

                    const title = cleanTitle(rawText);
                    if (!title || !shouldKeepItem(title)) return;

                    const date = parseJapaneseDate(rawText) || pageDate;
                    const fullUrl = makeAbsoluteUrl(href);
                    const id = `oyodo-${Buffer.from(fullUrl).toString('base64').slice(0, 12)}`;

                    items.set(id, {
                        id,
                        municipality: '大淀町',
                        title,
                        type: classifyType(title),
                        announcementDate: date,
                        biddingDate: source.status === '落札' ? (parseJapaneseDate(rawText) || date) : undefined,
                        link: fullUrl,
                        status: source.status,
                    });
                });
            } catch (error: unknown) {
                console.error(`[大淀町] エラー (${source.url}):`, error instanceof Error ? error.message : String(error));
            }
        }

        const result = Array.from(items.values()).sort((a, b) => b.announcementDate.localeCompare(a.announcementDate));
        console.log(`[大淀町] 合計 ${result.length} 件`);
        return result;
    }
}

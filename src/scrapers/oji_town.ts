import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
import { shouldKeepItem } from './common/filter';
import { extractPdfText } from './common/pdf_text';

const OJI_INDEX = 'https://www.town.oji.nara.jp/kakuka/somu/somu/gyomuannai/nyuusatu/nyuusatukouhyou/index.html';
const BASE_URL = 'https://www.town.oji.nara.jp';
const HEADERS = { 'User-Agent': 'Mozilla/5.0' };

function makeAbsoluteUrl(href: string): string {
    if (!href) return OJI_INDEX;
    if (href.startsWith('http')) return href;
    return `${BASE_URL}${href}`;
}

function parseUpdatedDate(html: string): string {
    const match = html.match(/更新日[:：]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (!match) return '';
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function classifyType(title: string): BiddingType {
    if (title.includes('設計') || title.includes('監理')) return 'コンサル';
    if (title.includes('委託') || title.includes('業務')) return '委託';
    return '建築';
}

export class OjiTownScraper implements Scraper {
    municipality: '王寺町' = '王寺町' as const;

    async scrape(): Promise<BiddingItem[]> {
        const items: BiddingItem[] = [];

        try {
            const indexRes = await axios.get(OJI_INDEX, {
                headers: HEADERS,
                timeout: 15000,
            });
            const $ = cheerio.load(indexRes.data);

            const links = $('a').toArray()
                .map(el => ({
                    title: $(el).text().trim(),
                    href: $(el).attr('href') || '',
                }))
                .filter(link => link.title && link.href);

            for (const link of links) {
                const normalizedTitle = link.title.replace(/\s+/g, ' ').trim();
                if (!shouldKeepItem(normalizedTitle)) continue;

                const fullUrl = makeAbsoluteUrl(link.href);
                const detailRes = await axios.get(fullUrl, { headers: HEADERS, timeout: 15000 });
                const detailHtml = detailRes.data as string;
                const detailDate = parseUpdatedDate(detailHtml);
                const isResult = detailHtml.includes('入札についての事後公表') || normalizedTitle.includes('事後公表');
                const titleMatch = detailHtml.match(/<h1[^>]*>([^<]+)<\/h1>/);
                const title = titleMatch?.[1]?.trim() || normalizedTitle;
                let biddingDate = '';

                if (!isResult) {
                    const $detail = cheerio.load(detailHtml);
                    const pdfHref = $detail('a').toArray()
                        .map(el => $detail(el).attr('href') || '')
                        .find(href => /nyusatukoukoku/i.test(href) || /公告/i.test(href));
                    if (pdfHref) {
                        const pdfUrl = pdfHref.startsWith('http') ? pdfHref : `https:${pdfHref}`;
                        try {
                            const pdfText = await extractPdfText(pdfUrl, 6);
                            const match = pdfText.match(/(?:第\s*6\s*入札日時等[\s\S]*?)?入札日時\s*令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
                            if (match) {
                                const year = 2018 + parseInt(match[1], 10);
                                biddingDate = `${year}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
                            }
                        } catch {
                            biddingDate = '';
                        }
                    }
                }

                items.push({
                    id: `oji-${Buffer.from(fullUrl).toString('base64').slice(0, 12)}`,
                    municipality: '王寺町',
                    title,
                    type: classifyType(title),
                    announcementDate: detailDate || parseUpdatedDate(indexRes.data),
                    biddingDate: biddingDate || undefined,
                    link: fullUrl,
                    status: isResult ? '落札' : '受付中',
                });
            }

        } catch (error: unknown) {
            console.error('[王寺町] エラー:', error instanceof Error ? error.message : String(error));
        }

        console.log(`[王寺町] 合計 ${items.length} 件`);
        return items;
    }
}

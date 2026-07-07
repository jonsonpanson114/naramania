import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
import { shouldKeepItem } from './common/filter';
import { extractPdfText } from './common/pdf_text';

const OJI_INDEX = 'https://www.town.oji.nara.jp/kakuka/somu/somu/gyomuannai/nyuusatu/nyuusatukouhyou/index.html';
const OJI_INDEX_JSON = 'https://www.town.oji.nara.jp/kakuka/somu/somu/gyomuannai/nyuusatu/nyuusatukouhyou/index.tree.json';
const OJI_PROCUREMENT_SITEMAP = 'https://www.town.oji.nara.jp/kakuka/somu/somu/gyomuannai/nyuusatu/sitemap.dir.xml';
const BASE_URL = 'https://www.town.oji.nara.jp';
const HEADERS = { 'User-Agent': 'Mozilla/5.0' };
const OJI_SUPPLEMENTAL_ITEMS: Array<{
    title: string;
    link: string;
    pdfUrl?: string;
    announcementDate: string;
    biddingDate?: string;
    status: '受付中' | '受付終了' | '落札' | '不調';
    winningContractor?: string;
}> = [
    {
        title: '事後審査型条件付一般競争入札の公表について（やわらぎ会館改修工事）',
        link: 'https://www.town.oji.nara.jp/kakuka/somu/somu/gyomuannai/nyuusatu/nyuusatukouhyou/11512.html',
        announcementDate: '2026-04-27',
        biddingDate: '2026-05-18',
        status: '受付終了' as const,
    },
];

const OJI_KNOWN_SCHEDULES: Record<string, { announcementDate: string; biddingDate: string }> = {
    'やわらぎ会館改修工事': {
        announcementDate: '2026-04-27',
        biddingDate: '2026-05-18',
    },
    '事後審査型条件付一般競争入札の公表について（やわらぎ会館改修工事）': {
        announcementDate: '2026-04-27',
        biddingDate: '2026-05-18',
    },
};

// タイトル単位で恒久除外したい案件だけを登録する（現在は無し）
const OJI_OUT_OF_SCOPE_TITLES = new Set<string>([]);

type OjiPage = {
    page_name: string;
    url: string;
    publish_datetime?: string;
};

type OjiSitemapEntry = {
    url: string;
    lastmod?: string;
};

function makeAbsoluteUrl(href: string): string {
    if (!href) return OJI_INDEX;
    if (href.startsWith('http')) return href;
    return `${BASE_URL}${href}`;
}

// ページ全文にはナビゲーション文言（「業務案内」など）が含まれ、
// 除外キーワードに誤ヒットするため本文コンテナだけを判定に使う
function extractOjiMainText($: cheerio.CheerioAPI): string {
    const main = $('#contents').first();
    const text = (main.length ? main.text() : $('body').text());
    return text.replace(/\s+/g, ' ').trim();
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

function normalizeOjiTitle(title: string): string {
    const wrapped = title.match(/(?:事後審査型条件付一般競争入札の公表について|事後公表)[（(](.+)[)）]/);
    if (wrapped?.[1]) {
        return wrapped[1].trim();
    }
    return title.trim();
}

function getKnownOjiSchedule(title: string): { announcementDate: string; biddingDate: string } | undefined {
    return OJI_KNOWN_SCHEDULES[title] || OJI_KNOWN_SCHEDULES[normalizeOjiTitle(title)];
}

function mergeOjiSupplementalItem(items: BiddingItem[], supplemental: typeof OJI_SUPPLEMENTAL_ITEMS[number]): void {
    const title = normalizeOjiTitle(supplemental.title);
    if (OJI_OUT_OF_SCOPE_TITLES.has(title)) return;
    if (!shouldKeepItem(title)) return;

    const existing = items.find(item => normalizeOjiTitle(item.title) === title);
    if (existing) {
        if (existing.biddingDate && existing.announcementDate > existing.biddingDate) {
            existing.announcementDate = supplemental.announcementDate;
        }
        if (!existing.biddingDate && supplemental.biddingDate) existing.biddingDate = supplemental.biddingDate;
        if (!existing.pdfUrl && supplemental.pdfUrl) existing.pdfUrl = supplemental.pdfUrl;
        if (!existing.winningContractor && supplemental.winningContractor) existing.winningContractor = supplemental.winningContractor;
        return;
    }

    items.push({
        id: `oji-supplemental-${Buffer.from(supplemental.link).toString('base64').slice(0, 12)}`,
        municipality: '王寺町',
        title,
        type: classifyType(title),
        announcementDate: supplemental.announcementDate,
        biddingDate: supplemental.biddingDate,
        link: supplemental.link,
        pdfUrl: supplemental.pdfUrl,
        status: supplemental.status,
        winningContractor: supplemental.winningContractor,
    });
}

async function fetchOjiProcurementSitemapEntries(): Promise<OjiSitemapEntry[]> {
    const res = await axios.get(OJI_PROCUREMENT_SITEMAP, {
        headers: HEADERS,
        timeout: 15000,
    });
    const $ = cheerio.load(res.data, { xmlMode: true });
    const entries: OjiSitemapEntry[] = [];

    $('url').each((_, element) => {
        const url = $(element).find('loc').text().trim();
        const lastmod = $(element).find('lastmod').text().trim();
        if (!url) return;
        entries.push({ url, lastmod });
    });

    return entries;
}

async function scrapeOjiProcurementSitemapPages(): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];

    try {
        const entries = await fetchOjiProcurementSitemapEntries();
        const candidateEntries = entries.filter(entry =>
            !entry.url.includes('/nyuusatukouhyou/')
            && !entry.url.endsWith('/index.html')
            && !entry.url.includes('/nyuusatusannkashikaku/'),
        );

        for (const entry of candidateEntries) {
            const detailRes = await axios.get(entry.url, {
                headers: HEADERS,
                timeout: 15000,
            });
            const detailHtml = detailRes.data as string;
            const $detail = cheerio.load(detailHtml);
            const rawTitle = $detail('h1').first().text().replace(/\s+/g, ' ').trim()
                || $detail('title').first().text().replace(/／王寺町$/, '').trim();
            const title = normalizeOjiTitle(rawTitle);
            if (OJI_OUT_OF_SCOPE_TITLES.has(title)) continue;
            const bodyText = extractOjiMainText($detail);

            // 本文には定型文由来の除外キーワードが混ざるため、判定はタイトルのみで行う
            if (!title || !shouldKeepItem(title)) continue;

            const announcementDate = parseUpdatedDate(detailHtml) || entry.lastmod?.slice(0, 10) || '';
            const isResult = /事後公表|落札|結果/u.test(rawTitle) || /落札|結果/u.test(bodyText);
            const knownSchedule = getKnownOjiSchedule(title);

            items.push({
                id: `oji-procurement-${Buffer.from(entry.url).toString('base64').slice(0, 12)}`,
                municipality: '王寺町',
                title,
                type: classifyType(title),
                announcementDate: knownSchedule?.announcementDate || announcementDate,
                biddingDate: knownSchedule?.biddingDate,
                link: entry.url,
                status: isResult ? '受付終了' : '受付中',
            });
        }
    } catch (error: unknown) {
        console.error('[王寺町] procurement sitemap 取得エラー:', error instanceof Error ? error.message : String(error));
    }

    return items;
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
            const jsonRes = await axios.get<OjiPage[]>(OJI_INDEX_JSON, {
                headers: HEADERS,
                timeout: 15000,
            });
            const links = jsonRes.data
                .map(link => ({
                    title: link.page_name.replace(/\s+/g, ' ').trim(),
                    href: link.url || '',
                    announcementDate: link.publish_datetime?.slice(0, 10) || '',
                }))
                .filter(link => link.title && link.href);

            for (const link of links) {
                const normalizedTitle = link.title.replace(/\s+/g, ' ').trim();
                if (!shouldKeepItem(normalizedTitle)) continue;

                const fullUrl = makeAbsoluteUrl(link.href);
                const detailRes = await axios.get(fullUrl, { headers: HEADERS, timeout: 15000 });
                const detailHtml = detailRes.data as string;
                const $detail = cheerio.load(detailHtml);
                const bodyText = extractOjiMainText($detail);
                const detailDate = parseUpdatedDate(detailHtml);
                const isAwardResult = /落札結果|入札結果|開札結果|落札者/u.test(bodyText) || /落札結果|入札結果|開札結果/u.test(normalizedTitle);
                const titleMatch = detailHtml.match(/<h1[^>]*>([^<]+)<\/h1>/);
                const title = normalizeOjiTitle(titleMatch?.[1]?.trim() || normalizedTitle);
                if (OJI_OUT_OF_SCOPE_TITLES.has(title)) continue;
                const knownSchedule = getKnownOjiSchedule(title);
                let biddingDate = '';

                if (!isAwardResult) {
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

                // タイトルが建築案件として通っていれば採用する。
                // 本文やPDFには「低入札価格調査制度」「ソフトウェアをダウンロード」等の
                // 定型文が含まれ、除外キーワードに誤ヒットするため判定に使わない。
                if (!shouldKeepItem(title)) continue;

                const effectiveBiddingDate = biddingDate || knownSchedule?.biddingDate;
                items.push({
                    id: `oji-${Buffer.from(fullUrl).toString('base64').slice(0, 12)}`,
                    municipality: '王寺町',
                    title,
                    type: classifyType(title),
                    announcementDate: knownSchedule?.announcementDate || detailDate || link.announcementDate || parseUpdatedDate(indexRes.data),
                    biddingDate: effectiveBiddingDate,
                    link: fullUrl,
                    status: isAwardResult ? '落札' : effectiveBiddingDate && effectiveBiddingDate < new Date().toISOString().slice(0, 10) ? '受付終了' : '受付中',
                });
            }

        } catch (error: unknown) {
            console.error('[王寺町] エラー:', error instanceof Error ? error.message : String(error));
        }

        for (const item of await scrapeOjiProcurementSitemapPages()) {
            if (!items.some(existing => existing.title === item.title)) {
                items.push(item);
            }
        }

        for (const supplemental of OJI_SUPPLEMENTAL_ITEMS) {
            mergeOjiSupplementalItem(items, supplemental);
        }

        console.log(`[王寺町] 合計 ${items.length} 件`);
        return items;
    }
}

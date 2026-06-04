import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, Scraper, BiddingType, Municipality } from '../types/bidding';
import { shouldKeepItem, classifyWinner } from './common/filter';

const TAKATORI_RESULT_URL = 'https://www.town.takatori.nara.jp/contents_detail.php?frmId=2205';
const IKARUGA_INDEX_URL = 'https://www.town.ikaruga.nara.jp/category/1-10-0-0-0-0-0-0-0-0.html';
const IKARUGA_BASE_URL = 'https://www.town.ikaruga.nara.jp';
const IKARUGA_SUPPLEMENTAL_ITEMS = [
    {
        title: '土木工事等技術支援業務',
        link: 'https://www.town.ikaruga.nara.jp/0000003285.html',
        announcementDate: '2026-04-24',
        status: '落札' as const,
        winningContractor: 'サンコーコンサルタント株式会社 奈良営業所',
    },
];

function classifyType(title: string): BiddingType {
    if (title.includes('設計') || title.includes('監理') || title.includes('コンサル')) return 'コンサル';
    if (title.includes('委託') || title.includes('業務')) return '委託';
    return '建築';
}

function parseJapaneseDate(text: string): string {
    const reiwa = text.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (reiwa) {
        const year = 2018 + Number(reiwa[1]);
        return `${year}-${String(Number(reiwa[2])).padStart(2, '0')}-${String(Number(reiwa[3])).padStart(2, '0')}`;
    }
    const western = text.match(/(20\d{2})\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (western) {
        return `${western[1]}-${String(Number(western[2])).padStart(2, '0')}-${String(Number(western[3])).padStart(2, '0')}`;
    }
    return '';
}

function parseIkarugaBiddingDate(title: string, pageDate: string): string {
    const match = title.match(/【(\d{1,2})月(\d{1,2})日入札分】/);
    if (!match || !pageDate) return '';
    const year = pageDate.slice(0, 4);
    return `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
}

function makeAbsoluteUrl(baseUrl: string, href?: string | null): string {
    if (!href) return baseUrl;
    if (href.startsWith('http')) return href;
    if (href.startsWith('/')) return `${IKARUGA_BASE_URL}${href}`;
    return new URL(href, `${baseUrl.replace(/[^/]+$/, '')}`).toString();
}

function buildId(municipality: Municipality, date: string, title: string): string {
    return `${municipality}-${date || 'undated'}-${title}`
        .normalize('NFKC')
        .replace(/[^\w\u3040-\u30ff\u3400-\u9fff-]+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 120);
}

async function scrapeTakatoriResults(): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];

    try {
        const res = await axios.get(TAKATORI_RESULT_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 20000,
        });
        const $ = cheerio.load(res.data);
        let sectionDate = '';

        $('h3, h4, tr').each((_, el) => {
            const tagName = el.tagName?.toLowerCase() || '';
            const text = $(el).text().replace(/\s+/g, ' ').trim();

            if ((tagName === 'h3' || tagName === 'h4') && text.includes('令和')) {
                sectionDate = parseJapaneseDate(text) || sectionDate;
                return;
            }

            if (tagName !== 'tr') return;
            const cells = $(el).find('td');
            if (cells.length < 4) return;

            const title = $(cells[0]).text().replace(/\s+/g, ' ').trim();
            const winner = $(cells[2]).text().replace(/\s+/g, ' ').trim();
            const amount = $(cells[3]).text().replace(/\s+/g, ' ').trim();
            if (!title || title === '業務名' || !shouldKeepItem(title)) return;

            const status = amount.includes('不調') || amount.includes('不成立') ? '不調' : '落札';
            const winningContractor = status === '落札' && winner && winner !== '-' ? winner : undefined;

            items.push({
                id: buildId('高取町', sectionDate, title),
                municipality: '高取町',
                title,
                type: classifyType(title),
                announcementDate: sectionDate,
                biddingDate: sectionDate || undefined,
                link: TAKATORI_RESULT_URL,
                status,
                winningContractor,
                winnerType: classifyWinner(winningContractor || ''),
            });
        });
    } catch (e: unknown) {
        console.warn('[高取町] 結果取得エラー:', e instanceof Error ? e.message : String(e));
    }

    return items;
}

async function scrapeIkarugaAnnouncements(): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];

    try {
        const res = await axios.get(IKARUGA_INDEX_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 20000,
        });
        const $ = cheerio.load(res.data);
        const detailLinks = new Set<string>();

        $('a').each((_, el) => {
            const title = $(el).text().replace(/\s+/g, ' ').trim();
            if (!title) return;
            if (!title.includes('入札') && !title.includes('閲覧図書')) return;
            const href = $(el).attr('href');
            if (!href) return;
            detailLinks.add(makeAbsoluteUrl(IKARUGA_INDEX_URL, href));
        });

        for (const detailUrl of detailLinks) {
            const detailRes = await axios.get(detailUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 20000,
            });
            const $$ = cheerio.load(detailRes.data);
            const pageDate = parseJapaneseDate($$.text());

            $$('tr').each((_, tr) => {
                const cells = $$(tr).find('td');
                if (cells.length < 2) return;
                const title = $$(cells[1]).text().replace(/\s+/g, ' ').trim() || $$(cells[0]).text().replace(/\s+/g, ' ').trim();
                if (!title || title === '工事名' || title === '業務名' || !shouldKeepItem(title)) return;
                const pageTitle = $$('.pageTitle, h1').first().text().replace(/\s+/g, ' ').trim() || $$('body').text();
                const biddingDate = parseIkarugaBiddingDate(pageTitle, pageDate);

                items.push({
                    id: buildId('斑鳩町', pageDate, title),
                    municipality: '斑鳩町',
                    title,
                    type: classifyType(title),
                    announcementDate: pageDate,
                    biddingDate: biddingDate || undefined,
                    link: detailUrl,
                    status: '受付中',
                });
            });
        }
    } catch (e: unknown) {
        console.warn('[斑鳩町] 公告取得エラー:', e instanceof Error ? e.message : String(e));
    }

    for (const supplemental of IKARUGA_SUPPLEMENTAL_ITEMS) {
        if (items.some(item => item.title === supplemental.title) || !shouldKeepItem(supplemental.title)) continue;
        items.push({
            id: buildId('斑鳩町', supplemental.announcementDate, supplemental.title),
            municipality: '斑鳩町',
            title: supplemental.title,
            type: classifyType(supplemental.title),
            announcementDate: supplemental.announcementDate,
            link: supplemental.link,
            status: supplemental.status,
            winningContractor: supplemental.winningContractor,
            winnerType: classifyWinner(supplemental.winningContractor),
        });
    }

    return items;
}

export class TakatoriTownScraper implements Scraper {
    municipality: '高取町' = '高取町' as const;

    async scrape(): Promise<BiddingItem[]> {
        const items = await scrapeTakatoriResults();
        console.log(`[高取町] 合計 ${items.length} 件`);
        return items;
    }
}

export class IkarugaTownScraper implements Scraper {
    municipality: '斑鳩町' = '斑鳩町' as const;

    async scrape(): Promise<BiddingItem[]> {
        const items = await scrapeIkarugaAnnouncements();
        console.log(`[斑鳩町] 合計 ${items.length} 件`);
        return items;
    }
}

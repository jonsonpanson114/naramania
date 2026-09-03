import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, BiddingType, Scraper } from '../types/bidding';

const BASE_URL = 'https://www.town.nara-kawanishi.lg.jp';
// 入札・契約の一覧カテゴリ。個別記事ID(0000008784等)を直接ハードコードしていたため、
// 町が新しい記事を出しても永久に古い2ページしか見ておらず、公告も結果も追従できていなかった。
// 一覧から都度記事を解決する。
const CATEGORY_URLS = [
    `${BASE_URL}/category/22-1-0-0-0-0-0-0-0-0.html`,
];
// 一覧から辿れなかった場合の保険（従来のハードコード先）
const FALLBACK_ARTICLE_URLS = [
    `${BASE_URL}/0000008784.html`,
    `${BASE_URL}/0000008613.html`,
];
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; naramania-scraper/1.0)' };
const ARTICLE_URL_PATTERN = /\/(?:\d{7,}|cmsfiles\/[^\s"']+)\.html?$/;
const KNOWN_KAWANISHI_ITEMS: BiddingItem[] = [
    {
        id: buildId('2026-04-01', '川西文化会館トイレ改修工事'),
        municipality: '川西町',
        title: '川西文化会館トイレ改修工事',
        type: '建築',
        announcementDate: '2026-04-01',
        link: 'https://www.town.nara-kawanishi.lg.jp/0000008785.html',
        status: '受付終了',
        isForecast: true,
    },
    {
        id: buildId('2026-04-01', '中央体育館修繕改修工事'),
        municipality: '川西町',
        title: '中央体育館修繕改修工事',
        type: '建築',
        announcementDate: '2026-04-01',
        link: 'https://www.town.nara-kawanishi.lg.jp/0000008785.html',
        status: '受付終了',
        isForecast: true,
    },
    {
        id: buildId('2026-04-01', '梅戸体育館屋根改修工事'),
        municipality: '川西町',
        title: '梅戸体育館屋根改修工事',
        type: '建築',
        announcementDate: '2026-04-01',
        link: 'https://www.town.nara-kawanishi.lg.jp/0000008785.html',
        status: '受付終了',
        isForecast: true,
    },
    {
        id: buildId('2026-04-01', 'ふれあいセンター改修工事'),
        municipality: '川西町',
        title: 'ふれあいセンター改修工事',
        type: '建築',
        announcementDate: '2026-04-01',
        link: 'https://www.town.nara-kawanishi.lg.jp/0000008785.html',
        status: '受付終了',
        isForecast: true,
    },
    {
        id: buildId('2026-04-01', '式下中学校体育館屋根・外壁その他改修工事設計業務'),
        municipality: '川西町',
        title: '式下中学校体育館屋根・外壁その他改修工事設計業務',
        type: 'コンサル',
        announcementDate: '2026-04-01',
        biddingDate: '2026-06-26',
        link: 'https://www.town.nara-kawanishi.lg.jp/cmsfiles/contents/0000008/8733/2406.pdf',
        status: '落札',
        winningContractor: '株式会社岩崎建築設計事務所',
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
    const western = text.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日/);
    if (western) {
        return `${western[1]}-${western[2].padStart(2, '0')}-${western[3].padStart(2, '0')}`;
    }
    return '';
}

function buildId(date: string, title: string): string {
    return `kawanishi-${date || 'undated'}-${title}`
        .normalize('NFKC')
        .replace(/[^\w\u3040-\u30ff\u3400-\u9fff-]+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 120);
}

function toAbsoluteUrl(href: string): string {
    if (!href) return '';
    if (href.startsWith('http')) return href;
    if (href.startsWith('//')) return `https:${href}`;
    if (href.startsWith('/')) return `${BASE_URL}${href}`;
    return `${BASE_URL}/${href.replace(/^\.\//, '')}`;
}

/** 一覧カテゴリから入札関連の記事URLを解決する */
async function resolveArticleUrls(): Promise<string[]> {
    const urls = new Set<string>();

    for (const categoryUrl of CATEGORY_URLS) {
        try {
            const res = await axios.get(categoryUrl, { headers: HEADERS, timeout: 20000 });
            const $ = cheerio.load(res.data);

            $('a[href]').each((_, el) => {
                const text = $(el).text().replace(/\s+/g, '').trim();
                const href = toAbsoluteUrl($(el).attr('href') || '');
                if (!href || !text) return;
                if (!href.startsWith(BASE_URL)) return;
                if (!ARTICLE_URL_PATTERN.test(href)) return;
                // 公告・結果の両方を対象にする（結果だけ／公告だけを見ない）
                if (!/(入札|公告|開札|落札|見積|プロポーザル|契約)/.test(text)) return;
                urls.add(href);
            });
        } catch (error) {
            console.warn('[川西町] 一覧取得エラー:', error instanceof Error ? error.message : String(error));
        }
    }

    for (const fallback of FALLBACK_ARTICLE_URLS) {
        urls.add(fallback);
    }

    return Array.from(urls);
}

function extractWinner(bodyText: string): string | undefined {
    const patterns = [
        /落札(?:者|業者|事業者)(?:名)?[：:\s]*([^\s。、]{2,40})/u,
        /契約(?:の)?相手方[：:\s]*([^\s。、]{2,40})/u,
        /受託(?:候補)?者[：:\s]*([^\s。、]{2,40})/u,
    ];
    for (const pattern of patterns) {
        const match = bodyText.match(pattern);
        const winner = match?.[1]?.trim();
        if (winner && !/^[0-9,]+$/.test(winner)) return winner;
    }
    return undefined;
}

async function scrapeAnnouncementPages(): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];
    const articleUrls = await resolveArticleUrls();
    console.log(`[川西町] 入札関連記事 ${articleUrls.length}件を解決`);

    for (const url of articleUrls) {
        try {
            const res = await axios.get(url, { headers: HEADERS, timeout: 20000 });
            const $ = cheerio.load(res.data);
            const title = $('h1').first().text().replace(/\s+/g, ' ').trim();
            const bodyText = $('body').text().replace(/\s+/g, ' ');
            const announcementDate = parseJapaneseDate(bodyText);
            if (!title) continue;

            const isResultPage = /(入札結果|開札結果|落札者|契約の相手方)/.test(title + bodyText);
            const winningContractor = isResultPage ? extractWinner(bodyText) : undefined;
            const isFailed = isResultPage && /(不調|不落|中止|取止め)/.test(bodyText);

            const id = buildId(announcementDate, title);
            if (items.some(existing => existing.id === id)) continue;

            items.push({
                id,
                municipality: '川西町',
                title,
                type: classifyType(title),
                announcementDate,
                biddingDate: parseJapaneseDate(bodyText.match(/開札日時?[\s\S]{0,100}/)?.[0] || '') || undefined,
                link: url,
                status: isFailed ? '不調' : winningContractor ? '落札' : isResultPage ? '受付終了' : '受付中',
                winningContractor,
            });
        } catch {
            // Skip missing historical pages.
        }
    }

    return items;
}

export class KawanishiCityScraper implements Scraper {
    municipality: '川西町' = '川西町' as const;

    async scrape(): Promise<BiddingItem[]> {
        const items = await scrapeAnnouncementPages();
        for (const knownItem of KNOWN_KAWANISHI_ITEMS) {
            if (!items.some(item => item.title === knownItem.title)) {
                items.push(knownItem);
            }
        }
        console.log(`[川西町] 合計 ${items.length} 件`);
        return items;
    }
}

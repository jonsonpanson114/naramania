import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

// 安堵町
const RSS_URL = 'https://www.town.ando.nara.jp/rss/rss.xml';
const CATEGORY_URL = 'https://www.town.ando.nara.jp/category/4-1-0-0-0-0-0-0-0-0.html';
const ANDO_SUPPLEMENTAL_ITEMS = [
    {
        title: '安堵町立安堵小中学校屋内運動場空調設備設置工事',
        link: 'https://www.town.ando.nara.jp/0000003986.html',
        announcementDate: '2026-04-22',
        biddingDate: '2026-05-27',
        status: '落札' as const,
        winningContractor: '吉村建設株式会社',
        pdfUrl: 'https://www.town.ando.nara.jp./cmsfiles/contents/0000003/3986/kaisatsu.pdf',
    },
    {
        title: '安堵町総合センターひびき施設管理業務委託',
        link: 'https://www.town.ando.nara.jp/0000003776.html',
        announcementDate: '2026-02-24',
        status: '受付終了' as const,
    },
    {
        title: '〖再度公告〗条件付き一般競争入札の実施について（安堵こども園南館外壁改修、トイレ乾式化および洋式化改修工事）',
        link: 'https://www.town.ando.nara.jp/0000003967.html',
        announcementDate: '2026-05-19',
        biddingDate: '2026-06-26',
        status: '受付中' as const,
    },
];
const ANDO_KNOWN_BIDDING_DATES: Record<string, string> = {
    // 公式ページの公告PDFと建設新報の公告要約から確認
    '条件付き一般競争入札の実施について（安堵町立安堵小中学校屋内運動場空調設備設置工事）': '2026-05-27',
    '【条件付き一般競争入札の結果】安堵町立安堵小中学校屋内運動場空調設備設置工事': '2026-05-27',
    '【再度公告】条件付き一般競争入札の実施について（安堵こども園南館外壁改修、トイレ乾式化および洋式化改修工事）': '2026-06-26',
    '〖再度公告〗条件付き一般競争入札の実施について（安堵こども園南館外壁改修、トイレ乾式化および洋式化改修工事）': '2026-06-26',
};

const ANDO_TITLE_NORMALIZATIONS: Record<string, string> = {
    '【条件付き一般競争入札の結果】安堵町立安堵小中学校屋内運動場空調設備設置工事': '安堵町立安堵小中学校屋内運動場空調設備設置工事',
};

const ANDO_KNOWN_ANNOUNCEMENT_DATES: Record<string, string> = {
    // 条件付き一般競争入札の実施について（安堵町立安堵小中学校屋内運動場空調設備設置工事） | 安堵町役場
    '安堵町立安堵小中学校屋内運動場空調設備設置工事': '2026-04-22',
};

function shouldSkip(title: string): boolean {
    return !shouldKeepItem(title);
}

function classifyType(title: string): BiddingType {
    if (title.includes('設計') || title.includes('測量') || title.includes('コンサル')) {
        return 'コンサル';
    }
    if (title.includes('業務委託') || title.includes('委託')) {
        return '委託';
    }
    return '建築';
}

function parseRssDate(dateStr: string): string {
    // "Tue, 24 Feb 2026 09:58:26 +0900" → "2026-02-24"
    const m = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
    if (!m) return '';

    const day = parseInt(m[1]);
    const month = m[2];
    const year = m[3];

    const monthMap: Record<string, number> = {
        'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
        'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
    };

    const monthNum = monthMap[month];
    if (!monthNum) return '';

    return `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeAndoLink(href: string): string {
    if (!href) return '';
    if (href.startsWith('http')) return href;
    return `https://www.town.ando.nara.jp${href}`;
}

function normalizeAndoWinner(raw: string): string {
    return raw
        .replace(/\s+/g, ' ')
        .replace(/\s+\d+\.\s*$/, '')
        .replace(/\s+(代表取締役|代表社員|代表|所長|支店長|営業所長).*$/, '')
        .trim();
}

function normalizeAndoTitle(title: string): string {
    return ANDO_TITLE_NORMALIZATIONS[title] || title;
}

function parseUpdatedDate(text: string): string {
    const western = text.match(/更新日[:：]\s*(20\d{2})年(\d{1,2})月(\d{1,2})日/);
    if (western) {
        return `${western[1]}-${western[2].padStart(2, '0')}-${western[3].padStart(2, '0')}`;
    }
    return '';
}

async function extractAndoResultDetails(resultPageUrl: string): Promise<{
    pdfUrl?: string;
    biddingDate?: string;
    winningContractor?: string;
    status?: BiddingItem['status'];
}> {
    try {
        const res = await axios.get(resultPageUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000,
        });
        const $ = cheerio.load(res.data);
        const pdfHref = $('a[href$=".pdf"], a[href*=".pdf"]').first().attr('href') || '';
        const pdfUrl = pdfHref ? normalizeAndoLink(pdfHref) : undefined;
        if (!pdfUrl) return {};

        const pdfRes = await axios.get<ArrayBuffer>(pdfUrl, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000,
        });
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const doc = await pdfjsLib.getDocument({
            data: new Uint8Array(pdfRes.data as ArrayBuffer),
            verbosity: 0,
            isEvalSupported: false,
        }).promise;

        let text = '';
        for (let i = 1; i <= doc.numPages; i += 1) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(item => ('str' in item ? item.str : '')).join(' ');
        }

        const normalized = text.replace(/\s+/g, ' ');
        const dateMatch = normalized.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
        const biddingDate = dateMatch ? `${2018 + Number(dateMatch[1])}-${String(Number(dateMatch[2])).padStart(2, '0')}-${String(Number(dateMatch[3])).padStart(2, '0')}` : undefined;
        if (/落\s*札\s*の\s*有\s*無[\s\S]{0,20}無|不調|不成立|取止め/.test(normalized)) {
            return { pdfUrl, biddingDate, status: '不調' };
        }

        const winnerMatch =
            normalized.match(/落\s*札\s*(?:者(?:名)?|業者)\s+(.+?)(?:\s+[0-9０-９][0-9０-９,，]*\s*円|\s+落札金額|\s+契約金額)/) ||
            normalized.match(/契\s*約\s*の\s*相\s*手\s*方\s+(.+?)(?:\s+\d{1,3}(?:,\d{3})+\s*円|\s+契約金額)/);

        return {
            pdfUrl,
            biddingDate,
            winningContractor: winnerMatch?.[1] ? normalizeAndoWinner(winnerMatch[1]) : undefined,
            status: '落札',
        };
    } catch {
        return {};
    }
}

async function scrapeAndoCity(): Promise<BiddingItem[]> {
    const items = new Map<string, BiddingItem>();

    try {
        const categoryRes = await axios.get(CATEGORY_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000,
        });
        const $category = cheerio.load(categoryRes.data);

        $category('a').each((i, el) => {
            const title = $category(el).text().trim().replace(/\s+/g, ' ');
            const href = $category(el).attr('href') || '';
            if (!title || !href) return;
            if (!title.includes('条件付き一般競争入札')) return;
            if (shouldSkip(title)) return;

            const link = normalizeAndoLink(href);
            const surroundingText = $category(el).parent().text().replace(/\s+/g, ' ');
            const normalizedTitle = normalizeAndoTitle(title);
            const announcementDate = ANDO_KNOWN_ANNOUNCEMENT_DATES[normalizedTitle]
                || parseUpdatedDate(surroundingText)
                || parseUpdatedDate(categoryRes.data)
                || parseRssDate(new Date().toUTCString());
            const item: BiddingItem = {
                id: `ando-category-${i}`,
                municipality: '安堵町',
                title: normalizedTitle,
                type: classifyType(title),
                announcementDate,
                biddingDate: ANDO_KNOWN_BIDDING_DATES[title] || ANDO_KNOWN_BIDDING_DATES[normalizedTitle],
                link,
                status: title.includes('結果') ? '落札' : '受付中',
            };
            items.set(item.title, item);
        });

        // RSSフィードを取得
        const res = await axios.get(RSS_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000,
        });
        const $ = cheerio.load(res.data, { xmlMode: true });

        // RSS itemの抽出
        $('item').each((i, el) => {
            const title = $(el).find('title').text().trim();
            const link = $(el).find('link').text().trim();
            const pubDate = $(el).find('pubDate').text().trim();

            if (!title || !link) return;

            // 入札・契約・工事に関する項目のみ抽出
            if (!title.includes('入札') && !title.includes('契約') &&
                !title.includes('落札') && !title.includes('工事')) {
                return;
            }

            // 令和8年度以降は対象外（令和7年度のみ収集）
            const fyMatch = title.match(/令和(\d+)年度/);
            if (fyMatch && parseInt(fyMatch[1]) > 7) return;

            if (shouldSkip(title)) return;

            // ステータス判定
            let status: '受付中' | '締切間近' | '受付終了' | '落札' = '受付中';
            if (title.includes('落札') || title.includes('結果')) {
                status = '落札';
            } else if (title.includes('資格審査')) {
                status = '受付終了';
            }

            const normalizedTitle = normalizeAndoTitle(title);
            const announcementDate = ANDO_KNOWN_ANNOUNCEMENT_DATES[normalizedTitle] || parseRssDate(pubDate);

            const item: BiddingItem = {
                id: `ando-${link.split('/').pop()?.replace('.html', '')}-${i}`,
                municipality: '安堵町',
                title: normalizedTitle,
                type: classifyType(title),
                announcementDate,
                biddingDate: ANDO_KNOWN_BIDDING_DATES[title] || ANDO_KNOWN_BIDDING_DATES[normalizedTitle],
                link,
                status,
            };
            if (!items.has(normalizedTitle)) items.set(normalizedTitle, item);
        });

    } catch (e: unknown) {
        console.error('[安堵町] エラー:', e instanceof Error ? e.message : String(e) || e);
    }

    const result = Array.from(items.values());

    for (const item of result) {
        if (item.status !== '落札') continue;
        const details = await extractAndoResultDetails(item.link);
        if (details.pdfUrl) item.pdfUrl = details.pdfUrl;
        if (details.biddingDate) item.biddingDate = details.biddingDate;
        if (details.status) item.status = details.status;
        if (details.winningContractor) item.winningContractor = details.winningContractor;
    }

    for (const supplemental of ANDO_SUPPLEMENTAL_ITEMS) {
        if (!items.has(supplemental.title) && !shouldSkip(supplemental.title)) {
            result.push({
                id: `ando-supplemental-${supplemental.link.split('/').pop()?.replace('.html', '')}`,
                municipality: '安堵町',
                title: supplemental.title,
                type: classifyType(supplemental.title),
                announcementDate: supplemental.announcementDate,
                biddingDate: supplemental.biddingDate,
                link: supplemental.link,
                status: supplemental.status,
                winningContractor: supplemental.winningContractor,
                pdfUrl: supplemental.pdfUrl,
            });
        }
    }

    console.log(`[安堵町] 合計 ${result.length} 件`);
    return result;
}

export class AndoCityScraper implements Scraper {
    municipality: '安堵町' = '安堵町' as const;

    async scrape(): Promise<BiddingItem[]> {
        return scrapeAndoCity();
    }
}

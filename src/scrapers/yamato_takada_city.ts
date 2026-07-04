import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import type { Element } from 'domhandler';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

// 大和高田市 入札情報
const BASE = 'https://www.city.yamatotakada.nara.jp';
const ANNOUNCEMENT_PAGES = [
    { url: `${BASE}/soshikikarasagasu/somuka/keiyakukanri/nyusatsu_keiyaku/2/1422.html`, label: '建設工事' },
    { url: `${BASE}/soshikikarasagasu/somuka/keiyakukanri/nyusatsu_keiyaku/2/1427.html`, label: '測量コンサル' },
];
const RESULT_PAGE = `${BASE}/soshikikarasagasu/somuka/keiyakukanri/nyusatsu_keiyaku/1/9099.html`;
const RESULT_BIDDING_DATES: Record<string, string> = {
    // 大和高田市公報 第439号（2025-08-08）で確認
    '市営住宅礒野団地4号棟外壁等改修工事設計業務委託': '2025-07-18',
    // 検索結果スニペット（NJSS）の発注情報抜粋で確認
    '大和高田市保健センター受電設備改修工事': '2025-06-13',
};

function classifyType(gyoshu: string, title: string): BiddingType {
    const t = gyoshu + title;
    if (t.includes('コンサル') || t.includes('設計') || t.includes('測量')) return 'コンサル';
    if (t.includes('委託') || t.includes('業務')) return '委託';
    return '建築';
}

function shouldSkip(gyoshu: string, title: string): boolean {
    return !shouldKeepItem(title, gyoshu);
}

function extractAnnouncementTitle(cell: cheerio.Cheerio<Element>): string {
    const firstLink = cell.find('a').first().text().trim();
    if (firstLink) {
        return firstLink.replace(/\(PDFファイル:[^)]+\)/g, '').trim();
    }

    const firstParagraph = cell.find('p').first().text().trim();
    if (firstParagraph) {
        return firstParagraph.replace(/※[\s\S]*/, '').trim();
    }

    return cell.text().replace(/※[\s\S]*/, '').trim();
}

function makeId(title: string): string {
    return `yamato-takada-${crypto.createHash('md5').update(title).digest('hex').slice(0, 8)}`;
}

function parseJapaneseDate(text: string): string {
    const m = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    const m2 = text.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (m2) {
        const year = 2018 + parseInt(m2[1]);
        return `${year}-${m2[2].padStart(2, '0')}-${m2[3].padStart(2, '0')}`;
    }
    return '';
}

function findPageUpdateDate($: cheerio.CheerioAPI): string {
    let date = '';
    $('*').contents().filter((_, node) => node.type === 'text').each((_, node) => {
        const text = ('data' in node && typeof node.data === 'string') ? node.data : '';
        const d = parseJapaneseDate(text);
        if (d) { date = d; return false; }
    });
    // Also check common update date patterns
    const bodyText = $('body').text();
    const m = bodyText.match(/更新日[：:]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    return date || new Date().toISOString().split('T')[0];
}

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; naramania-scraper/1.0)' };

function errorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    if (error && typeof error === 'object' && 'code' in error) return String(error.code);
    return String(error || 'unknown error');
}

export class YamatoTakadaCityScraper implements Scraper {
    municipality: '大和高田市' = '大和高田市' as const;
    private errors: string[] = [];

    getDiagnostics() {
        return { errors: this.errors };
    }

    private recordError(message: string) {
        this.errors.push(message);
    }

    async scrape(): Promise<BiddingItem[]> {
        this.errors = [];
        const allItems: BiddingItem[] = [];

        // ── 入札公告（受付中）────────────────────────────
        for (const { url, label } of ANNOUNCEMENT_PAGES) {
            console.log(`[大和高田市] ${label}/入札公告 取得中...`);
            try {
                const res = await axios.get(url, { timeout: 30000, headers: HEADERS });
                const $ = cheerio.load(res.data);
                const pageDate = findPageUpdateDate($);

                // table rows: 公告番号|件名|場所|設計金額|工事種別|確認申請締切り日
                $('table tr').each((i, row) => {
                    if (i === 0) return; // header
                    const cells = $(row).find('td');
                    if (cells.length < 5) return;

                    const titleRaw = extractAnnouncementTitle(cells.eq(1));
                    const gyoshu = cells.eq(4).text().trim();

                    if (!titleRaw || titleRaw === '件名') return;
                    if (shouldSkip(gyoshu, titleRaw)) return;

                    allItems.push({
                        id: makeId(titleRaw),
                        municipality: '大和高田市',
                        title: titleRaw,
                        type: classifyType(gyoshu, titleRaw),
                        announcementDate: pageDate,
                        link: url,
                        status: '受付中',
                    });
                });
                console.log(`[大和高田市] ${label}/入札公告: ${allItems.length}件（累計）`);
            } catch (e: unknown) {
                const message = `[大和高田市] ${label}/入札公告 エラー: ${errorMessage(e)}`;
                this.recordError(message);
                console.warn(message);
            }
        }

        // ── 入札結果（落札）─────────────────────────────
        console.log(`[大和高田市] 入札結果 取得中...`);
        try {
            const res = await axios.get(RESULT_PAGE, { timeout: 30000, headers: HEADERS });
            const $ = cheerio.load(res.data);
            const beforeCount = allItems.length;

            let currentMonth = 0;
            $('h2').each((_, h2El) => {
                const monthText = $(h2El).text().replace(/\s+/g, '').trim();
                const monthMatch = monthText.match(/(\d{1,2})月/);
                if (!monthMatch) return;
                currentMonth = parseInt(monthMatch[1]);

                let nextEl = $(h2El).next();
                while (nextEl.length > 0 && nextEl[0]?.tagName !== 'h2') {
                    if (nextEl.is('div.wysiwyg')) {
                        const title = nextEl.find('p strong').first().text().replace(/\s+/g, ' ').trim();
                        let contractor = '';

                        nextEl.find('table tr').each((_, tr) => {
                            const tds = $(tr).find('td');
                            if (tds.length >= 2) {
                                const label = tds.eq(0).text().replace(/\s+/g, '').trim();
                                const value = tds.eq(1).text().replace(/\s+/g, ' ').trim();
                                if (label === '落札業者' || label === '落札者') {
                                    contractor = value;
                                }
                            }
                        });

                        if (title && !shouldSkip('', title)) {
                            const isAwarded = contractor && contractor !== '不成立' && contractor !== 'なし';
                            allItems.push({
                                id: makeId(title + '-result'),
                                municipality: '大和高田市',
                                title,
                                type: classifyType('', title),
                                announcementDate: `2025-${String(currentMonth).padStart(2, '0')}-01`,
                                biddingDate: RESULT_BIDDING_DATES[title],
                                link: RESULT_PAGE,
                                status: isAwarded ? '落札' : '受付終了',
                                ...(isAwarded ? { winningContractor: contractor } : {}),
                            });
                        }
                    }

                    nextEl = nextEl.next();
                }
            });

            console.log(`[大和高田市] 入札結果: ${allItems.length - beforeCount}件`);
        } catch (e: unknown) {
            const message = `[大和高田市] 入札結果 エラー: ${errorMessage(e)}`;
            this.recordError(message);
            console.warn(message);
        }

        console.log(`[大和高田市] 合計 ${allItems.length} 件`);
        return allItems;
    }
}

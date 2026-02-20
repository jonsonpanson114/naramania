import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';

const BASE_URL = 'https://www.city.kashihara.nara.jp';

// 入札予報ページ（テーブル形式: 契約番号|案件名|公告書PDF|登録業種|地域区分|設計図書掲載日）
const YOHO_PAGES = [
    { url: `${BASE_URL}/jigyosha/nyusatsu_keiyaku/1/7/8273.html`, label: '工事' },
    { url: `${BASE_URL}/jigyosha/nyusatsu_keiyaku/1/7/12117.html`, label: '委託' },
    { url: `${BASE_URL}/jigyosha/nyusatsu_keiyaku/1/7/12118.html`, label: '発掘調査・植栽管理' },
];

// プロポーザルページ（リンク形式: 案件番号+案件名がリンクテキスト、日付はh2見出し）
const PROPOSAL_URL = `${BASE_URL}/jigyosha/nyusatsu_keiyaku/1/7/8272.html`;

// 令和7年度入札結果ページ（テーブル形式: 契約番号|案件名|公表開札録PDF、業種列なし、日付はh2見出し）
const KEKKA_PAGES = [
    { url: `${BASE_URL}/jigyosha/nyusatsu_keiyaku/1/8/reiwa7/18371.html`, label: '工事結果' },
    { url: `${BASE_URL}/jigyosha/nyusatsu_keiyaku/1/8/reiwa7/18375.html`, label: '委託結果' },
    { url: `${BASE_URL}/jigyosha/nyusatsu_keiyaku/1/8/reiwa7/18373.html`, label: '発掘調査等結果' },
];

// 業種（登録業種）に基づくスキップキーワード（入札予報テーブル用）
const GYOSHU_SKIP = [
    '土木一式', '土木工事', '舗装工事', '法面工事', '河川工事',
    '砂防工事', '造園工事', '水道工事', '管工事', '電気工事',
    '通信工事', '機械設備',
];

// 案件名に基づくスキップキーワード（業種列のない結果・プロポーザルページ用）
const TITLE_SKIP = [
    ...GYOSHU_SKIP,
    '橋梁', '排水路', '側溝', '水路工', '堤防',
];

const AXIOS_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
};

function parseJapaneseDate(text: string): string {
    const m = text.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (m) {
        const year = 2018 + parseInt(m[1]);
        return `${year}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }
    return '';
}

// 登録業種列あり（入札予報テーブル）
function classifyByGyoshu(gyoshu: string): BiddingType | null {
    if (!gyoshu) return '委託';
    if (GYOSHU_SKIP.some(kw => gyoshu.includes(kw))) return null;
    if (gyoshu.includes('建築')) return '建築';
    if (gyoshu.includes('設計') || gyoshu.includes('測量') || gyoshu.includes('地質') ||
        gyoshu.includes('補償コンサル') || gyoshu.includes('コンサルタント')) return 'コンサル';
    return '委託';
}

// 業種列なし（入札結果・プロポーザル）- 案件名で分類
function classifyByTitle(title: string): BiddingType {
    if (title.includes('設計') || title.includes('測量') || title.includes('コンサル') || title.includes('地質')) return 'コンサル';
    if (title.includes('建築') || title.includes('改修') || title.includes('整備') || title.includes('工事')) return '建築';
    return '委託';
}

function normalizePdfUrl(href: string): string | undefined {
    if (!href) return undefined;
    if (href.startsWith('//')) return `https:${href}`;
    if (href.startsWith('/')) return `${BASE_URL}${href}`;
    if (href.startsWith('http')) return href;
    return undefined;
}

export class KashiharaCityScraper implements Scraper {
    municipality: '橿原市' = '橿原市';

    async scrape(): Promise<BiddingItem[]> {
        const items: BiddingItem[] = [];

        // === 1. 入札予報ページ（テーブル形式・業種列あり）===
        for (const { url, label } of YOHO_PAGES) {
            const beforeCount = items.length;
            try {
                console.log(`[橿原市] Fetching ${label}: ${url}`);
                const res = await axios.get<string>(url, { headers: AXIOS_HEADERS, timeout: 30000 });
                const $ = cheerio.load(res.data);

                // ページ冒頭の見出しから公告日を取得
                const heading = $('h1, h2, h3').first().text();
                const announcementDate = parseJapaneseDate(heading) || new Date().toISOString().split('T')[0];

                $('table').each((_, table) => {
                    $(table).find('tr').slice(1).each((_, row) => {
                        const cells = $(row).find('td').toArray();
                        if (cells.length < 2) return;

                        const contractNo = $(cells[0]).text().trim();
                        const title = $(cells[1]).text().trim();
                        if (!title || !contractNo || contractNo.includes('契約番号')) return;

                        const pdfHref = cells.length > 2 ? $(cells[2]).find('a').attr('href') || '' : '';
                        const gyoshu = cells.length > 3 ? $(cells[3]).text().trim() : '';

                        const biddingType = classifyByGyoshu(gyoshu);
                        if (biddingType === null) {
                            console.log(`[橿原市] スキップ（土木系）: ${title} [${gyoshu}]`);
                            return;
                        }

                        items.push({
                            id: `kashihara-${contractNo}`,
                            municipality: '橿原市',
                            title,
                            type: biddingType,
                            announcementDate,
                            link: url,
                            pdfUrl: normalizePdfUrl(pdfHref),
                            status: '受付中',
                        });
                    });
                });

                console.log(`[橿原市] ${label}: ${items.length - beforeCount}件取得`);
            } catch (e: any) {
                console.error(`[橿原市] ${label} エラー:`, e.message || e);
            }
        }

        // === 2. プロポーザルページ（リンク形式・日付はh2見出し）===
        {
            const beforeCount = items.length;
            try {
                console.log(`[橿原市] Fetching プロポーザル: ${PROPOSAL_URL}`);
                const res = await axios.get<string>(PROPOSAL_URL, { headers: AXIOS_HEADERS, timeout: 30000 });
                const $ = cheerio.load(res.data);

                let currentDate = new Date().toISOString().split('T')[0];
                const seen = new Set<string>();

                // h2とaを文書順に処理して日付とリンクを対応付け
                $('h2, a').each((_, el) => {
                    if (el.tagName === 'h2') {
                        const d = parseJapaneseDate($(el).text());
                        if (d) currentDate = d;
                    } else {
                        const linkText = $(el).text().trim();
                        const href = $(el).attr('href') || '';
                        if (!linkText || !href) return;

                        // リンクテキスト = 案件番号(6桁以上の数字) + 案件名
                        const m = linkText.match(/^(\d{6,})\s*(.+?)(\s*（.*?）)?\s*$/);
                        if (!m) return;

                        const contractNo = m[1];
                        const title = m[2].trim();

                        // 同一案件番号の重複（質疑回答等）をスキップ
                        if (seen.has(contractNo)) return;
                        seen.add(contractNo);

                        if (TITLE_SKIP.some(kw => title.includes(kw))) {
                            console.log(`[橿原市] スキップ（土木系）: ${title}`);
                            return;
                        }

                        items.push({
                            id: `kashihara-proposal-${contractNo}`,
                            municipality: '橿原市',
                            title,
                            type: classifyByTitle(title),
                            announcementDate: currentDate,
                            link: PROPOSAL_URL,
                            pdfUrl: normalizePdfUrl(href),
                            status: '受付中',
                        });
                    }
                });

                console.log(`[橿原市] プロポーザル: ${items.length - beforeCount}件取得`);
            } catch (e: any) {
                console.error(`[橿原市] プロポーザル エラー:`, e.message || e);
            }
        }

        // === 3. 令和7年度入札結果ページ（テーブル形式・業種列なし・日付はh2見出し）===
        for (const { url, label } of KEKKA_PAGES) {
            const beforeCount = items.length;
            try {
                console.log(`[橿原市] Fetching ${label}: ${url}`);
                const res = await axios.get<string>(url, { headers: AXIOS_HEADERS, timeout: 30000 });
                const $ = cheerio.load(res.data);

                let currentDate = new Date().toISOString().split('T')[0];

                // h2（日付見出し）とtable（案件行）を文書順に処理
                $('h2, table').each((_, el) => {
                    if (el.tagName === 'h2') {
                        const d = parseJapaneseDate($(el).text());
                        if (d) currentDate = d;
                    } else {
                        $(el).find('tr').slice(1).each((_, row) => {
                            const cells = $(row).find('td').toArray();
                            if (cells.length < 2) return;

                            const contractNo = $(cells[0]).text().trim();
                            const title = $(cells[1]).text().trim();
                            if (!title || !contractNo) return;

                            if (TITLE_SKIP.some(kw => title.includes(kw))) {
                                console.log(`[橿原市] スキップ（土木系）: ${title}`);
                                return;
                            }

                            const pdfHref = cells.length > 2 ? $(cells[2]).find('a').attr('href') || '' : '';

                            items.push({
                                id: `kashihara-result-${contractNo}`,
                                municipality: '橿原市',
                                title,
                                type: classifyByTitle(title),
                                announcementDate: currentDate,
                                link: url,
                                pdfUrl: normalizePdfUrl(pdfHref),
                                status: '落札',
                            });
                        });
                    }
                });

                console.log(`[橿原市] ${label}: ${items.length - beforeCount}件取得`);
            } catch (e: any) {
                console.error(`[橿原市] ${label} エラー:`, e.message || e);
            }
        }

        // 重複をIDで除外
        const seen = new Set<string>();
        const unique = items.filter(item => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });

        console.log(`[橿原市] 合計 ${unique.length} 件`);
        return unique;
    }
}

import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';

// 大和高田市 入札情報
const BASE = 'https://www.city.yamatotakada.nara.jp';
const ANNOUNCEMENT_PAGES = [
    { url: `${BASE}/soshikikarasagasu/keiyakukanrishitsu/nyusatsu_keiyaku/2/1422.html`, label: '建設工事' },
    { url: `${BASE}/soshikikarasagasu/keiyakukanrishitsu/nyusatsu_keiyaku/2/1427.html`, label: '測量コンサル' },
];
const RESULT_PAGE = `${BASE}/soshikikarasagasu/keiyakukanrishitsu/nyusatsu_keiyaku/1/9099.html`;

// 土木系をスキップ
const SKIP_GYOSHU = ['舗装', '土木', '管渠', '下水', '河川', '造園', '電気通信', '水道'];

function shouldSkip(gyoshu: string, title: string): boolean {
    return SKIP_GYOSHU.some(kw => gyoshu.includes(kw) || title.includes(kw));
}

function classifyType(gyoshu: string, title: string): BiddingType {
    const t = gyoshu + title;
    if (t.includes('コンサル') || t.includes('設計') || t.includes('測量')) return 'コンサル';
    if (t.includes('委託') || t.includes('業務')) return '委託';
    return '建築';
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
        const text = (node as any).data || '';
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

export class YamatoTakadaCityScraper implements Scraper {
    municipality: '大和高田市' = '大和高田市';

    async scrape(): Promise<BiddingItem[]> {
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

                    // 件名: br以降の「※」注釈を除去
                    const titleRaw = cells.eq(1).clone().find('br ~ *').remove().end()
                        .text().replace(/※.*/s, '').trim();
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
            } catch (e: any) {
                console.warn(`[大和高田市] ${label}/入札公告 エラー:`, e.message?.split('\n')[0]);
            }
        }

        // ── 入札結果（落札）─────────────────────────────
        console.log(`[大和高田市] 入札結果 取得中...`);
        try {
            const res = await axios.get(RESULT_PAGE, { timeout: 30000, headers: HEADERS });
            const $ = cheerio.load(res.data);
            const beforeCount = allItems.length;

            // 新しい構造: h2(月) → strong(案件タイトル) → table(落札業者/落札金額)
            const REIWA7_BASE = 2025;
            let currentMonth = 1;

            // 各 h2 (月) セクションを処理
            $('h2').each((_, h2El) => {
                const h2Text = $(h2El).text().trim();
                const monthMatch = h2Text.match(/(\d+)月/);
                if (!monthMatch) return;
                currentMonth = parseInt(monthMatch[1]);

                // h2 の後にある strong + table のペアを取得
                let nextEl = $(h2El).next();
                while (nextEl.length > 0) {
                    // 次の h2 か ドキュメントの終わりに達したら終了
                    if (nextEl[0].tagName === 'H2') break;

                    const strongEl = nextEl.find('strong').first();
                    const tableEl = nextEl.find('table').first();

                    if (strongEl.length > 0 && tableEl.length > 0) {
                        const title = strongEl.text().trim();

                        // テーブルから落札業者を取得
                        let contractor = '';
                        tableEl.find('tr').each((_, tr) => {
                            const tds = $(tr).find('td');
                            if (tds.length >= 2) {
                                const label = tds.eq(0).text().trim();
                                const value = tds.eq(1).text().trim();
                                if (label === '落札業者' || label === '落札者') {
                                    contractor = value;
                                }
                            }
                        });

                        if (title && !shouldSkip('', title)) {
                            const month = String(currentMonth).padStart(2, '0');
                            // 「不成立」や「なし」は除外
                            if (!contractor || contractor === '不成立' || contractor === 'なし') {
                                contractor = '';
                            }
                            allItems.push({
                                id: makeId(title + '-result'),
                                municipality: '大和高田市',
                                title,
                                type: classifyType('', title),
                                announcementDate: `${REIWA7_BASE}-${month}-01`,
                                link: RESULT_PAGE,
                                status: '落札',
                                ...(contractor ? { winningContractor: contractor } : {}),
                            });
                        }
                    }

                    nextEl = nextEl.next();
                }
            });

            console.log(`[大和高田市] 入札結果: ${allItems.length - beforeCount}件`);
        } catch (e: any) {
            console.warn(`[大和高田市] 入札結果 エラー:`, e.message?.split('\n')[0]);
        }

        console.log(`[大和高田市] 合計 ${allItems.length} 件`);
        return allItems;
    }
}

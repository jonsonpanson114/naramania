import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

// 大和郡山市 入札情報（SMART CMS JSON API 経由）
const BASE = 'https://www.city.yamatokoriyama.lg.jp';
const RESULT_JSON   = `${BASE}/shigoto_sangyo/nyusatsu_keiyaku/nyusatsunooshirase/index.tree.json`;
const ANNOUNCE_JSON = `${BASE}/shigoto_sangyo/nyusatsu_keiyaku/nyusatsu/index.tree.json`;

// タイトルに含まれていれば対象（建築・設計系）
const INCLUDE_TITLE_KEYWORDS = [
    '工事', '設計', '改修', '修繕', '新築', '建設', '解体', '建築',
    '測量', '点検', '耐震', '監理', '計画', '補修', '整備', '施設',
    '実施設計', '基本設計',
];
// タイトルに含まれていればスキップ（土木系・非建築）
const SKIP_TITLE_KEYWORDS = [
    '車両', '物品', '清掃', '警備', '廃棄', 'システム', '役務', '電力供給',
    '下水道', '管渠', '舗装', '土木', '河川', '造園', '電気通信', '水道施設',
    '農業', '交通安全施設', '道路維持', '橋梁', '浄水', '井戸',
];

function titleSeemsRelevant(title: string): boolean {
    return shouldKeepItem(title);
}

function classifyType(title: string): BiddingType {
    if (title.includes('設計') || title.includes('測量') || title.includes('コンサル') || title.includes('地質')) return 'コンサル';
    if (title.includes('委託') || title.includes('業務')) return '委託';
    return '建築';
}

function makeId(title: string, suffix: string = ''): string {
    return `yamato-koriyama-${crypto.createHash('md5').update(title + suffix).digest('hex').slice(0, 8)}`;
}

function parseDate(text: string): string {
    const m = text.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (m) {
        const year = 2018 + parseInt(m[1]);
        return `${year}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }
    const m2 = text.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (m2) return `${m2[1]}-${m2[2].padStart(2, '0')}-${m2[3].padStart(2, '0')}`;
    return '';
}

interface CmsPage {
    page_name: string;
    url: string;
    publish_datetime: string;
    is_category_index: boolean;
    child_pages?: CmsPage[];
    child_pages_count?: number;
}

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; naramania-scraper/1.0)' };

async function fetchChildPages(jsonUrl: string, yearPattern: RegExp): Promise<CmsPage[]> {
    const res = await axios.get<CmsPage[]>(jsonUrl, { timeout: 15000, headers: HEADERS });
    const pages: CmsPage[] = res.data;
    // 令和7年度のカテゴリインデックスを探す
    const r7 = pages.find(p => p.is_category_index && yearPattern.test(p.page_name));
    if (r7?.child_pages) return r7.child_pages;
    // フォールバック: child_pages_count最大のもの
    const sorted = [...pages].sort((a, b) => (b.child_pages_count || 0) - (a.child_pages_count || 0));
    return sorted[0]?.child_pages || [];
}

async function scrapeDetailPage(url: string): Promise<{
    biddingDate?: string;
    contractor?: string;
    tableItems?: Array<{ title: string; type: string; contractor: string; biddingDate: string }>;
}> {
    try {
        const res = await axios.get(url, { timeout: 20000, headers: HEADERS });
        const $ = cheerio.load(res.data);
        const bodyText = $('body').text();

        // 開札日
        const bm = bodyText.match(/開札日[：:]\s*([^\n]+)/);
        const biddingDate = bm ? parseDate(bm[1]) : undefined;

        // テーブルから落札者・複数件名を探す
        const tableItems: Array<{ title: string; type: string; contractor: string; biddingDate: string }> = [];

        $('table').each((_, tbl) => {
            const rows = $(tbl).find('tr').toArray();
            if (rows.length < 2) return;

            const headerCells = $(rows[0]).find('th, td').map((_, c) => $(c).text().trim()).toArray();
            const titleIdx = headerCells.findIndex(h => h.includes('件名') || h.includes('業務名') || h.includes('工事名'));
            const typeIdx  = headerCells.findIndex(h => h.includes('種別') || h.includes('業種'));
            const contractorIdx = headerCells.findIndex(h => h.includes('落札'));
            const biddingDateIdx = headerCells.findIndex(h => h.includes('開札'));

            if (titleIdx < 0) return;

            for (let i = 1; i < rows.length; i++) {
                const cells = $(rows[i]).find('td').map((_, c) => $(c).text().trim()).toArray();
                if (cells.length <= titleIdx) continue;
                const title = cells[titleIdx]?.trim();
                if (!title || title.length < 4 || title === '件名' || title === '業務名') continue;

                const type = typeIdx >= 0 ? (cells[typeIdx] || '') : '';
                const contractor = contractorIdx >= 0 ? (cells[contractorIdx] || '') : '';
                const bd = biddingDateIdx >= 0 ? parseDate(cells[biddingDateIdx] || '') : '';

                tableItems.push({ title, type, contractor, biddingDate: bd });
            }
        });

        // 落札者（テーブルなしの場合）
        const cm = bodyText.match(/落札(?:者|業者)[：:]\s*([^\n\r]+)/);
        const contractor = cm ? cm[1].trim() : undefined;

        return { biddingDate, contractor, tableItems };
    } catch {
        return {};
    }
}

export class YamatokoriyamaCityScraper implements Scraper {
    municipality: '大和郡山市' = '大和郡山市';

    async scrape(): Promise<BiddingItem[]> {
        const allItems: BiddingItem[] = [];

        for (const { jsonUrl, status, label } of [
            { jsonUrl: ANNOUNCE_JSON, status: '受付中' as const, label: '入札公告' },
            { jsonUrl: RESULT_JSON,   status: '落札'   as const, label: '入札結果' },
        ]) {
            console.log(`[大和郡山市] ${label} JSON取得中...`);
            try {
                const children = await fetchChildPages(jsonUrl, /令和7年度|R7/i);
                const relevant = children.filter(p => !p.is_category_index && titleSeemsRelevant(p.page_name));
                console.log(`[大和郡山市] ${label}: ${children.length}件中 ${relevant.length}件が対象`);

                for (const page of relevant) {
                    const annoDate = page.publish_datetime
                        ? page.publish_datetime.split('T')[0]
                        : new Date().toISOString().split('T')[0];

                    const detail = await scrapeDetailPage(page.url);

                    // テーブルに複数件がある場合
                    if (detail.tableItems && detail.tableItems.length > 0) {
                        for (const row of detail.tableItems) {
                            if (SKIP_TITLE_KEYWORDS.some(kw => row.title.includes(kw))) continue;
                            allItems.push({
                                id: makeId(row.title, page.url),
                                municipality: '大和郡山市',
                                title: row.title,
                                type: classifyType(row.title + row.type),
                                announcementDate: annoDate,
                                biddingDate: row.biddingDate || detail.biddingDate || undefined,
                                link: page.url,
                                status,
                                ...(row.contractor && status === '落札' ? { winningContractor: row.contractor } : {}),
                            });
                        }
                    } else {
                        // テーブルなし → ページタイトルで1件
                        allItems.push({
                            id: makeId(page.page_name, page.url),
                            municipality: '大和郡山市',
                            title: page.page_name,
                            type: classifyType(page.page_name),
                            announcementDate: annoDate,
                            biddingDate: detail.biddingDate || undefined,
                            link: page.url,
                            status,
                            ...(detail.contractor && status === '落札' ? { winningContractor: detail.contractor } : {}),
                        });
                    }
                    await new Promise(r => setTimeout(r, 200));
                }
                console.log(`[大和郡山市] ${label}: ${allItems.length}件（累計）`);
            } catch (e: any) {
                console.error(`[大和郡山市] ${label} エラー:`, e.message || e);
            }
        }

        console.log(`[大和郡山市] 合計 ${allItems.length} 件`);
        return allItems;
    }
}

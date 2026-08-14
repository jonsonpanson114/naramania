import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
import { shouldKeepItem } from './common/filter';
import { getCurrentReiwaFiscalYear } from './common/fiscal_year';

const BASE_URL = 'https://www.city.kashihara.nara.jp';

// 入札予報ページ（テーブル形式: 契約番号|案件名|公告書PDF|登録業種|地域区分|設計図書掲載日）
const YOHO_PAGES = [
    { url: `${BASE_URL}/jigyosha/nyusatsu_keiyaku/1/7/12117.html`, label: '委託' },
    { url: `${BASE_URL}/jigyosha/nyusatsu_keiyaku/1/7/12149.html`, label: '役務・物品' },
    { url: `${BASE_URL}/jigyosha/nyusatsu_keiyaku/1/7/16438.html`, label: 'クリーンセンター運営委託' },
];

// プロポーザルページ（リンク形式: 案件番号+案件名がリンクテキスト、日付はh2見出し）
const PROPOSAL_URL = `${BASE_URL}/jigyosha/nyusatsu_keiyaku/1/7/8272.html`;
const PROPOSAL_REVIEW_DATES: Record<string, string> = {
    // 実施要領 6.スケジュール「プレゼンテーション及びヒアリング」
    '5082000026': '2026-05-26',
};

// 「橿原市入札・見積結果」ページ。年度ごとにサブページのURLパスが
// 「/jigyosha/nyusatsu_keiyaku/1/8/reiwa7/」→「/soshiki/1019/gyomu/1/1/1/reiwa8nen/」の
// ようにパターンごと変わり、ページIDも年度と無関係に振られるため、ハードコードでは
// 年度が変わるたびに古い年度のページを見続けて新しい結果が一切拾えなくなる。
// (実際、reiwa7固定のままだったため令和8年度に入ってからの結果が全滅していた。)
// 都度ここから最新年度のサブページ一覧を解決する。
const KEKKA_INDEX_URL = `${BASE_URL}/jigyosha/nyusatsu_keiyaku/1/8/index.html`;

function normalizeKashiharaUrl(href: string): string {
    if (!href) return '';
    if (href.startsWith('http')) return href;
    if (href.startsWith('//')) return `https:${href}`;
    if (href.startsWith('/')) return `${BASE_URL}${href}`;
    return href;
}

type YearResultPages = {
    kekkaPages: { url: string; label: string }[];
    proposalResultUrl?: string;
};

async function resolveResultPagesForYear(targetReiwa: number): Promise<YearResultPages> {
    const indexRes = await axios.get<string>(KEKKA_INDEX_URL, { headers: AXIOS_HEADERS, timeout: 20000 });
    const $index = cheerio.load(indexRes.data);

    let yearPageUrl = '';
    $index('a').each((_, el) => {
        const text = $index(el).text().normalize('NFKC').replace(/\s+/g, '').trim();
        const m = text.match(/^令和(\d+)年度$/);
        if (m && parseInt(m[1], 10) === targetReiwa) {
            yearPageUrl = normalizeKashiharaUrl($index(el).attr('href') || '');
        }
    });
    if (!yearPageUrl) return { kekkaPages: [] };

    const yearRes = await axios.get<string>(yearPageUrl, { headers: AXIOS_HEADERS, timeout: 20000 });
    const $year = cheerio.load(yearRes.data);
    const kekkaPages: { url: string; label: string }[] = [];
    let proposalResultUrl: string | undefined;

    $year('a').each((_, el) => {
        const text = $year(el).text().normalize('NFKC').replace(/\s+/g, '').trim();
        const href = normalizeKashiharaUrl($year(el).attr('href') || '');
        if (!href) return;

        if (text.includes('プロポーザル案件実施結果')) {
            proposalResultUrl = href;
            return;
        }

        const m = text.match(/^(?:入札結果|見積結果)\(令和\d+年度(.+?)\)$/);
        if (!m) return;
        if (m[1].includes('物品')) return; // 物品購入は建築・設計と無関係のため対象外

        kekkaPages.push({ url: href, label: `令和${targetReiwa}年度${m[1]}結果` });
    });

    return { kekkaPages, proposalResultUrl };
}

/**
 * 「橿原市入札・見積結果」ページから結果一覧のサブページを解決する。
 * 当年度だけを見ると、年度替わり直後は前年度末に決まった結果がまだ大量に
 * 残っている一方で当年度側の掲載がまだ少なく、取得件数が急減して
 * isSuspiciousMunicipalityShrink のセーフガードに毎回引っかかり続ける
 * (実際、当年度のみにしたところ 19件→13件 に見えて弾かれた)。
 * 当年度・前年度の両方を見て安定させる。
 */
async function resolveCurrentYearResultPages(): Promise<YearResultPages> {
    const currentReiwa = getCurrentReiwaFiscalYear();

    try {
        const [current, previous] = await Promise.all([
            resolveResultPagesForYear(currentReiwa),
            resolveResultPagesForYear(currentReiwa - 1),
        ]);

        const seenUrls = new Set<string>();
        const kekkaPages: { url: string; label: string }[] = [];
        for (const page of [...current.kekkaPages, ...previous.kekkaPages]) {
            if (seenUrls.has(page.url)) continue;
            seenUrls.add(page.url);
            kekkaPages.push(page);
        }

        return {
            kekkaPages,
            proposalResultUrl: current.proposalResultUrl || previous.proposalResultUrl,
        };
    } catch (e: unknown) {
        console.error('[橿原市] 年度別結果ページ解決エラー:', e instanceof Error ? e.message : String(e));
        return { kekkaPages: [] };
    }
}

// 業種（登録業種）に基づくスキップキーワード（入札予報テーブル用）
const GYOSHU_SKIP = [
    '土木一式', '土木工事', '舗装工事', '法面工事', '河川工事',
    '砂防工事', '造園工事', '水道工事', '管工事', '電気工事',
    '通信工事', '機械設備', '橋梁', '橋', '測量', '地質調査',
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

type PdfResultDetails = {
    winningContractor?: string;
    biddingDate?: string;
    isAwarded?: boolean;
};

function extractBiddingDateFromPdfText(text: string): string | undefined {
    const match = text.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日\s*入札執行/);
    if (!match) return undefined;

    const year = 2018 + parseInt(match[1]);
    return `${year}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

// PDF から落札者名・開札日を抽出（pdfjs-dist ESM dynamic import）
async function extractResultDetailsFromPdf(pdfUrl: string): Promise<PdfResultDetails> {
    try {
        const res = await axios.get<ArrayBuffer>(pdfUrl, {
            responseType: 'arraybuffer',
            headers: AXIOS_HEADERS,
            timeout: 15000,
        });
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const data = new Uint8Array(res.data as ArrayBuffer);
        const doc = await pdfjsLib.getDocument({ data, verbosity: 0, isEvalSupported: false }).promise;

        let text = '';
        for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
        }

        const biddingDate = extractBiddingDateFromPdfText(text);
        const hasNoAward = /落札の有無\s+無/.test(text) || /不成立|不落/.test(text);
        if (hasNoAward) {
            return { biddingDate, isAwarded: false };
        }

        // パターン1: 「落札者氏名 ○○株式会社 代表取締役...」or 数字ラベルで終端
        const m1 = text.match(/落札者氏名\s+(.+?)(?:代表取締役|代表社員|代表者|第\d+回入札|\s{3,}|\d{2}\s)/);
        if (m1?.[1]) {
            const name = m1[1].trim();
            // 数字で始まる・落札者所在地を含む → 無効
            if (name && !/^\d/.test(name) && !name.includes('落札者所在地')) {
                return {
                    winningContractor: name.replace(/\s+第\d+回入札.*$/, '').trim(),
                    biddingDate,
                    isAwarded: true,
                };
            }
        }

        // パターン2: 「○○株式会社 落札12,000,000」
        const m2 = text.match(/((?:㈱|㈲|株式会社|有限会社|合同会社)[\S]+)\s+落札[\d,]/);
        if (m2?.[1]) {
            return {
                winningContractor: m2[1].trim(),
                biddingDate,
                isAwarded: true,
            };
        }

        // パターン3: プロポーザル方式実施結果(様式第6号)は「落札者」ではなく
        // 「契約業者名 ○○ 契約業者所在地」という様式になっている。
        const m3 = text.match(/契約業者名\s+(.+?)契約業者所在地/);
        if (m3?.[1]) {
            const name = m3[1]
                .replace(/[０-９\d]+\s*[．.]\s*$/, '') // 末尾に紛れ込む項目番号(「１０．」等)を除去
                .replace(/\s+/g, ' ')
                .trim();
            if (name && !/^\d/.test(name)) {
                return {
                    winningContractor: name,
                    biddingDate,
                    isAwarded: true,
                };
            }
        }

        return { biddingDate };
    } catch {
        return {};
    }
}

function parseJapaneseDate(text: string): string {
    const m = text.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (m) {
        const year = 2018 + parseInt(m[1]);
        return `${year}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }
    return '';
}

function parseHeadingDates(text: string): { announcementDate?: string; biddingDate?: string } {
    const matches = Array.from(text.matchAll(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/g));
    const toIsoDate = (match: RegExpMatchArray) => {
        const year = 2018 + parseInt(match[1]);
        return `${year}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    };

    if (matches.length === 0) return {};

    return {
        announcementDate: toIsoDate(matches[0]),
        biddingDate: matches[1] ? toIsoDate(matches[1]) : undefined,
    };
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
    municipality: '橿原市' = '橿原市' as const;

    async scrape(): Promise<BiddingItem[]> {
        const items: BiddingItem[] = [];
        const { kekkaPages, proposalResultUrl } = await resolveCurrentYearResultPages();
        console.log(`[橿原市] 今年度の結果ページ ${kekkaPages.length}件を解決 (プロポーザル結果: ${proposalResultUrl ? 'あり' : 'なし'})`);

        // === 1. 入札予報ページ（テーブル形式・業種列あり）===
        for (const { url, label } of YOHO_PAGES) {
            const beforeCount = items.length;
            try {
                console.log(`[橿原市] Fetching ${label}: ${url}`);
                const res = await axios.get<string>(url, { headers: AXIOS_HEADERS, timeout: 30000 });
                const $ = cheerio.load(res.data);
                let currentAnnouncementDate = '';
                let currentBiddingDate: string | undefined;

                $('h2, h3, table').each((_, el) => {
                    if (el.tagName === 'h2' || el.tagName === 'h3') {
                        const parsed = parseHeadingDates($(el).text());
                        if (parsed.announcementDate) {
                            currentAnnouncementDate = parsed.announcementDate;
                            currentBiddingDate = parsed.biddingDate;
                        }
                        return;
                    }

                    if (!currentAnnouncementDate) return;

                    $(el).find('tr').slice(1).each((_, row) => {
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

                        if (!shouldKeepItem(title, gyoshu)) {
                            console.log(`[橿原市] スキップ（土木キーワード）: ${title}`);
                            return;
                        }

                        items.push({
                            id: `kashihara-${contractNo}`,
                            municipality: '橿原市',
                            title,
                            type: biddingType,
                            announcementDate: currentAnnouncementDate,
                            biddingDate: currentBiddingDate,
                            link: url,
                            pdfUrl: normalizePdfUrl(pdfHref),
                            status: '受付中',
                            winnerType: biddingType === '建築' ? 'ゼネコン' : '設計事務所',
                        });
                    });
                });

                console.log(`[橿原市] ${label}: ${items.length - beforeCount}件取得`);
            } catch (e: unknown) {
                console.error(`[橿原市] ${label} エラー:`, e instanceof Error ? e.message : String(e) || e);
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

                        if (!shouldKeepItem(title)) {
                            console.log(`[橿原市] スキップ（土木キーワード）: ${title}`);
                            return;
                        }

                        items.push({
                            id: `kashihara-proposal-${contractNo}`,
                            municipality: '橿原市',
                            title,
                            type: classifyByTitle(title),
                            announcementDate: currentDate,
                            biddingDate: PROPOSAL_REVIEW_DATES[contractNo],
                            link: PROPOSAL_URL,
                            pdfUrl: normalizePdfUrl(href),
                            status: '受付中',
                        });
                    }
                });

                console.log(`[橿原市] プロポーザル: ${items.length - beforeCount}件取得`);
            } catch (e: unknown) {
                console.error(`[橿原市] プロポーザル エラー:`, e instanceof Error ? e.message : String(e) || e);
            }
        }

        // === 2b. プロポーザル案件実施結果ページで結果を補完 ===
        // 案件名をクリック→個別PDF(1案件1PDF)という構造で、公告ページとは
        // 契約番号が共通なので、公告から拾った項目にPDFを紐付けて④のPDF解析に回す。
        if (proposalResultUrl) {
            try {
                console.log(`[橿原市] Fetching プロポーザル結果: ${proposalResultUrl}`);
                const res = await axios.get<string>(proposalResultUrl, { headers: AXIOS_HEADERS, timeout: 30000 });
                const $ = cheerio.load(res.data);
                let matched = 0;

                $('a').each((_, el) => {
                    const linkText = $(el).text().trim();
                    const href = $(el).attr('href') || '';
                    if (!linkText || !href) return;

                    const m = linkText.match(/^(\d{6,})/);
                    if (!m) return;
                    const contractNo = m[1];
                    const pdfUrl = normalizePdfUrl(href);
                    if (!pdfUrl) return;

                    const target = items.find(item => item.id === `kashihara-proposal-${contractNo}`);
                    if (!target) return;
                    target.pdfUrl = pdfUrl;
                    target.status = '落札'; // ④のPDF解析ループが pdfUrl から実際の可否/落札者を確定させる
                    matched += 1;
                });

                console.log(`[橿原市] プロポーザル結果: ${matched}件を公告済み案件に紐付け`);
            } catch (e: unknown) {
                console.error('[橿原市] プロポーザル結果 エラー:', e instanceof Error ? e.message : String(e) || e);
            }
        }

        // === 3. 今年度入札結果ページ（テーブル形式・業種列なし・日付はh2見出し）===
        for (const { url, label } of kekkaPages) {
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
                                winnerType: classifyByTitle(title) === '建築' ? 'ゼネコン' : '設計事務所',
                            });
                        });
                    }
                });

                console.log(`[橿原市] ${label}: ${items.length - beforeCount}件取得`);
            } catch (e: unknown) {
                console.error(`[橿原市] ${label} エラー:`, e instanceof Error ? e.message : String(e) || e);
            }
        }

        // === 4. 入札結果のPDFから落札者名を抽出（3件並行）===
        const rakusatsuItems = items.filter(i => i.status === '落札' && i.pdfUrl);
        console.log(`[橿原市] PDF解析: ${rakusatsuItems.length}件`);
        const CONCURRENCY = 3;
        for (let i = 0; i < rakusatsuItems.length; i += CONCURRENCY) {
            const batch = rakusatsuItems.slice(i, i + CONCURRENCY);
            await Promise.all(batch.map(async (item) => {
                const details = await extractResultDetailsFromPdf(item.pdfUrl!);
                if (details.winningContractor) {
                    item.winningContractor = details.winningContractor;
                    console.log(`[橿原市] 落札者: ${item.title.slice(0, 20)} → ${details.winningContractor}`);
                }
                if (details.biddingDate) {
                    item.biddingDate = details.biddingDate;
                }
                if (details.isAwarded === false) {
                    item.status = '不調';
                    delete item.winningContractor;
                }
            }));
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

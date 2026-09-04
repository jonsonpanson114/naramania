import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
import { fiscalMonthToCalendarYear, getCurrentReiwaFiscalYear } from './common/fiscal_year';

interface PdfJsContentItem {
    str: string;
}

interface PdfJsPage {
    getTextContent(): Promise<{ items: PdfJsContentItem[] }>;
}

interface PdfJsDocument {
    numPages: number;
    getPage(pageNum: number): Promise<PdfJsPage>;
}

interface PdfJsGetDocumentOptions {
    data: Uint8Array;
    useWorkerFetch: boolean;
    isEvalSupported: boolean;
    useSystemFonts: boolean;
}

interface PdfJsPdfjsLib {
    getDocument(options: PdfJsGetDocumentOptions): { promise: Promise<PdfJsDocument> };
}

async function extractContractorFromPdf(pdfUrl: string): Promise<string | undefined> {
    try {
        const res = await axios.get(pdfUrl, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 20000,
        });
        // ESM dynamic import（pdfjs-dist はESMのみ）
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs') as PdfJsPdfjsLib;
        const data = new Uint8Array(res.data as ArrayBuffer);
        const doc = await pdfjsLib.getDocument({
            data,
            useWorkerFetch: false,
            isEvalSupported: false,
            useSystemFonts: true,
        }).promise;

        let text = '';
        for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map((s: PdfJsContentItem) => s.str).join(' ') + '\n';
        }

        // スペースを正規化して「商号、名称 [会社名] [数字] 〃」パターンで抽出
        const normalized = text.replace(/\s+/g, ' ');
        const m = normalized.match(/商号[,、]名称\s+(.+?)\s+\d\s+〃/);
        if (m) return m[1].trim();

        // フォールバック: 落札予定業者名
        const m2 = normalized.match(/落札予定業者名\s+(.+?)\s+(?:\d+[,，]?\d*\s*円|$)/);
        if (m2) return m2[1].trim();

        return undefined;
    } catch {
        return undefined;
    }
}

const BASE_URL = 'https://www.town.koryo.nara.jp';
// 入札・契約の親カテゴリ。指名競争入札結果(19-4-2)だけを見ていたため
// 開札済みの案件しか拾えず、まだ応札できる入札公告が1件も入っていなかった。
// 親カテゴリから公告側・結果側の両方のサブカテゴリを都度解決する。
const PARENT_CATEGORY_URL = `${BASE_URL}/category/19-4-0-0-0-0-0-0-0-0.html`;
// 指名競争入札結果カテゴリページ（親から辿れなかったときのフォールバック）
const CATEGORY_URL = `${BASE_URL}/category/19-4-2-0-0-0-0-0-0-0.html`;

const HTTP_HEADERS = { 'User-Agent': 'Mozilla/5.0' };

// 「一覧」「こちら」等のナビゲーション文言を案件名と誤認しないための足切り
const NON_ITEM_TITLE = /^(?:こちら|一覧|トップ|ホーム|前へ|次へ|戻る|PDF|ダウンロード|お問い合わせ|このページ)/;

function toAbsoluteUrl(href: string): string {
    if (!href) return '';
    if (href.startsWith('http')) return href;
    if (href.startsWith('//')) return `https:${href}`;
    if (href.startsWith('/')) return `${BASE_URL}${href}`;
    return `${BASE_URL}/${href.replace(/^\.\//, '')}`;
}

function parseAnyJapaneseDate(text: string): string {
    const reiwa = text.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (reiwa) {
        const year = 2018 + parseInt(reiwa[1], 10);
        return `${year}-${reiwa[2].padStart(2, '0')}-${reiwa[3].padStart(2, '0')}`;
    }
    const western = text.match(/(20\d{2})\s*[年/-]\s*(\d{1,2})\s*[月/-]\s*(\d{1,2})/);
    if (western) {
        return `${western[1]}-${western[2].padStart(2, '0')}-${western[3].padStart(2, '0')}`;
    }
    return '';
}

/** 親カテゴリから「入札公告(発注情報)」側のページURLを解決する */
async function resolveAnnouncementPages(): Promise<{ url: string; label: string }[]> {
    const pages = new Map<string, string>();

    try {
        const res = await axios.get(PARENT_CATEGORY_URL, { headers: HTTP_HEADERS, timeout: 15000 });
        const $ = cheerio.load(res.data);

        $('a[href]').each((_, el) => {
            const label = $(el).text().replace(/\s+/g, '').trim();
            const href = toAbsoluteUrl($(el).attr('href') || '');
            if (!label || !href) return;
            if (!/town\.koryo\.nara\.jp/.test(href)) return;
            // 「結果」系は別ロジックで処理するので公告側だけを拾う
            if (label.includes('結果')) return;
            if (!/(入札公告|入札情報|発注(見通し|情報)|公告|指名競争入札(?!結果))/.test(label)) return;
            pages.set(href, label);
        });
    } catch (e: unknown) {
        console.warn('[広陵町] 入札公告カテゴリ解決エラー:', e instanceof Error ? e.message : String(e));
    }

    return Array.from(pages.entries()).map(([url, label]) => ({ url, label }));
}

/** 公告ページから案件(受付中)を拾う。添付ファイル一覧・本文リンクの双方に対応する */
async function scrapeAnnouncementPage(url: string, label: string): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];

    try {
        const res = await axios.get(url, { headers: HTTP_HEADERS, timeout: 15000 });
        const $ = cheerio.load(res.data);
        const pageDate = parseAnyJapaneseDate($('body').text()) || new Date().toISOString().split('T')[0];

        $('a[href]').each((_, el) => {
            const rawTitle = $(el).text().replace(/\s+/g, ' ').trim();
            const href = toAbsoluteUrl($(el).attr('href') || '');
            if (!rawTitle || !href) return;
            // カテゴリ一覧ページのリンク(/category/19-4-1-....html 等)を案件と誤認しないよう、
            // 公告文書そのもの(PDF/Word/Excel)へのリンクだけを案件として扱う。
            if (!/\.(pdf|docx?|xlsx?)(?:$|\?)/i.test(href)) return;

            const title = rawTitle
                .replace(/\((?:PDF|Word|Excel)ファイル[^)]*\)/g, '')
                .replace(/\[[^\]]*\]/g, '')
                .trim();
            if (title.length < 6 || NON_ITEM_TITLE.test(title)) return;

            const itemDate = parseAnyJapaneseDate(rawTitle) || pageDate;
            const id = `koryo-announce-${itemDate}-${title}`
                .normalize('NFKC')
                .replace(/[^\w\u3040-\u30ff\u3400-\u9fff-]+/g, '-')
                .replace(/-+/g, '-')
                .slice(0, 120);
            if (items.some(existing => existing.id === id)) return;

            items.push({
                id,
                municipality: '広陵町',
                title,
                type: classifyType(label, title),
                announcementDate: itemDate,
                link: href,
                pdfUrl: /\.pdf(?:$|\?)/i.test(href) ? href : undefined,
                status: '受付中',
            });
        });
    } catch (e: unknown) {
        console.warn(`[広陵町] 公告ページ取得エラー(${label}):`, e instanceof Error ? e.message : String(e));
    }

    return items;
}

function classifyType(section: string, title: string): BiddingType {
    if (section.includes('測量') || section.includes('設計') || section.includes('コンサル')) {
        return 'コンサル';
    }
    if (title.includes('設計') || title.includes('測量') || title.includes('コンサル')) {
        return 'コンサル';
    }
    return '建築';
}

// "No3 案件名（5月13日開札）" → { no: '3', name: '案件名', date: '2026-05-13' }
// 年はページの「令和N年度」表記から算出する
function parseItem(text: string, fiscalYearStart: number): { no: string; name: string; date: string } | null {
    const m = text.match(/^No(\d+)\s+(.+?)（(\d+)月(\d+)日開札）/);
    if (!m) return null;
    const no = m[1];
    const name = m[2].trim();
    const month = parseInt(m[3]);
    const day = parseInt(m[4]);
    const year = fiscalMonthToCalendarYear(fiscalYearStart, month);
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { no, name, date };
}

export class KoryoTownScraper implements Scraper {
    municipality: '広陵町' = '広陵町' as const;

    async scrape(): Promise<BiddingItem[]> {
        const items: BiddingItem[] = [];

        try {
            // カテゴリページから今年度URLを動的取得
            const catRes = await axios.get(CATEGORY_URL, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 15000,
            });
            const $cat = cheerio.load(catRes.data);

            // 「令和N年度 指名競争入札結果」のうち現在年度以下で最大のNを選ぶ
            const currentReiwa = getCurrentReiwaFiscalYear();
            let yearUrl = '';
            let reiwaYear = 0;
            $cat('a[href]').each((_, el) => {
                const href = $cat(el).attr('href') || '';
                const text = $cat(el).text().trim();
                const m = text.match(/令和(\d+)年度\s*指名競争入札結果/);
                if (!m || !href) return;
                const year = parseInt(m[1]);
                if (year > currentReiwa || year <= reiwaYear) return;
                reiwaYear = year;
                yearUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
            });

            if (!yearUrl) {
                console.warn('[広陵町] 指名競争入札結果URLが見つかりません');
                return items;
            }
            const fiscalYearStart = reiwaYear + 2018;
            console.log(`[広陵町] URL: 令和${reiwaYear}年度 ${yearUrl}`);

            const res = await axios.get(yearUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 15000,
            });
            const $ = cheerio.load(res.data);

            // 1st pass: 同期的に候補を収集
            type Candidate = {
                id: string; title: string; type: BiddingType;
                date: string; link: string; pdfUrl?: string;
            };
            const candidates: Candidate[] = [];

            $('div.mol_attachfileblock').each((_, block) => {
                const sectionTitle = $(block).find('p.mol_attachfileblock_title').text().trim();
                if (!sectionTitle.includes('入札結果')) return;

                $(block).find('ul li').each((_, li) => {
                    const text = $(li).text().replace(/\s+/g, ' ').trim();
                    if (!text) return;
                    const parsed = parseItem(text, fiscalYearStart);
                    if (!parsed) return;
                    const { no, name, date } = parsed;
                    if (!name) return;

                    const pdfHref = $(li).find('a').attr('href') || '';
                    const pdfUrl = pdfHref
                        ? (pdfHref.startsWith('http') ? pdfHref : `${BASE_URL}/${pdfHref.replace(/^\.\//, '')}`)
                        : '';
                    candidates.push({
                        id: `koryo-${date}-No${no}`,
                        title: name,
                        type: classifyType(sectionTitle, name),
                        date,
                        link: pdfUrl || yearUrl,
                        pdfUrl: pdfUrl || undefined,
                    });
                });
            });

            // 2nd pass: 非同期でPDFから落札者を抽出
            for (const c of candidates) {
                const winningContractor = c.pdfUrl
                    ? await extractContractorFromPdf(c.pdfUrl)
                    : undefined;
                items.push({
                    id: c.id,
                    municipality: '広陵町',
                    title: c.title,
                    type: c.type,
                    announcementDate: c.date,
                    biddingDate: c.date,
                    link: c.link,
                    pdfUrl: c.pdfUrl,
                    status: '落札',
                    winningContractor,
                });
            }

        } catch (e: unknown) {
            console.error('[広陵町] エラー:', e instanceof Error ? e.message : String(e) || e);
        }

        // ── 入札公告（受付中）─────────────────────────────
        const announcementPages = await resolveAnnouncementPages();
        console.log(`[広陵町] 入札公告ページ ${announcementPages.length}件を解決: ${announcementPages.map(p => p.label).join(' / ') || 'なし'}`);
        for (const page of announcementPages) {
            const announcements = await scrapeAnnouncementPage(page.url, page.label);
            for (const announcement of announcements) {
                if (items.some(existing => existing.title === announcement.title)) continue;
                items.push(announcement);
            }
            console.log(`[広陵町] 公告(${page.label}): ${announcements.length}件`);
        }

        console.log(`[広陵町] 合計 ${items.length} 件`);
        return items;
    }
}

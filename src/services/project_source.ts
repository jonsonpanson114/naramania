import axios from 'axios';
import * as cheerio from 'cheerio';
import type { BiddingItem } from '../types/bidding';
import { isGatedLink } from '../scrapers/common/project_brief';
import { fetchUrl } from './news_service';

/**
 * 案件の中身が書かれた資料(公告ページの本文とPDF)を集める。
 *
 * 電子入札システム(EPI・efftis・県PPI)はURLだけでは案件の詳細へ入れないので、
 * ここでは扱わない。読めない案件は noSource を返し、何も無かったことを隠さない。
 */

export interface ProjectSource {
    pageText?: string;
    pdfs: Buffer[];
    pdfUrls: string[];
    noSource?: string;
}

const SUPPORT_DOCUMENT = /注意事項|手引き|様式|記載例|記入例|質問書|質疑|回答|委任状|申請書|参加表明書/;
const MAX_PAGE_TEXT = 24000;
const MAX_PDFS = 2;
const MAX_PDF_BYTES = 15 * 1024 * 1024;

function normalize(text: string): string {
    return text.normalize('NFKC').replace(/[\s　・、。()（）「」【】]/g, '');
}

/** 案件名の先頭から、ページ内で案件を見分ける手がかりを作る */
function titleKey(title: string): string {
    return normalize(title.replace(/^【[^】]*】/, '').replace(/令和\S*?年度/, '')).slice(0, 10);
}

async function downloadPdf(url: string): Promise<Buffer | null> {
    try {
        const res = await axios.get<ArrayBuffer>(url, {
            responseType: 'arraybuffer',
            timeout: 30000,
            maxContentLength: MAX_PDF_BYTES,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' },
        });
        return Buffer.from(res.data);
    } catch {
        return null;
    }
}

/** ページ内のPDFのうち、この案件のものを選ぶ。案件名が近くに無ければ、PDFが少ないページだけ採用する */
export function pickProjectPdfLinks(html: string, pageUrl: string, title: string): string[] {
    const $ = cheerio.load(html);
    const key = titleKey(title);
    const candidates: Array<{ url: string; matched: boolean }> = [];

    $('a[href]').each((_, anchor) => {
        const href = $(anchor).attr('href') || '';
        if (!/\.pdf(?:$|[?#])/i.test(href)) return;
        const text = $(anchor).text();
        const row = $(anchor).closest('tr, li, p').text();
        if (SUPPORT_DOCUMENT.test(text)) return;
        try {
            const url = new URL(href, pageUrl).toString();
            if (candidates.some(candidate => candidate.url === url)) return;
            candidates.push({ url, matched: normalize(`${text} ${row}`).includes(key) });
        } catch {
            // 壊れたリンクは読まない
        }
    });

    const matched = candidates.filter(candidate => candidate.matched);
    const chosen = matched.length > 0 ? matched : candidates.length <= MAX_PDFS ? candidates : [];
    return chosen.slice(0, MAX_PDFS).map(candidate => candidate.url);
}

export async function gatherProjectSource(item: Pick<BiddingItem, 'title' | 'link' | 'pdfUrl'>): Promise<ProjectSource> {
    const urls = new Set<string>();
    if (item.pdfUrl) urls.add(item.pdfUrl);
    let pageText: string | undefined;

    const isPdfLink = /\.pdf(?:$|[?#])/i.test(item.link || '');
    if (isPdfLink) {
        urls.add(item.link);
    } else if (item.link && !isGatedLink(item.link)) {
        try {
            const html = await fetchUrl(item.link);
            const $ = cheerio.load(html);
            $('script, style, nav, header, footer').remove();
            pageText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, MAX_PAGE_TEXT);
            pickProjectPdfLinks(html, item.link, item.title).forEach(url => urls.add(url));
        } catch {
            // ページが読めなくてもPDFがあれば続ける
        }
    }

    const pdfUrls = Array.from(urls).slice(0, MAX_PDFS);
    const buffers = await Promise.all(pdfUrls.map(downloadPdf));
    const pdfs = buffers.filter((buffer): buffer is Buffer => buffer !== null);

    if (!pageText && pdfs.length === 0) {
        return {
            pdfs,
            pdfUrls,
            noSource: isGatedLink(item.link) ? '電子入札システムの案件で、URLから詳細へ入れない' : '資料を取得できなかった',
        };
    }
    return { pageText, pdfs, pdfUrls };
}

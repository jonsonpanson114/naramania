import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
import { shouldKeepItem } from './common/filter';

async function extractContractorFromPdf(pdfUrl: string): Promise<string | undefined> {
    try {
        const res = await axios.get(pdfUrl, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 20000,
        });
        // ESM dynamic import（pdfjs-dist はESMのみ）
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs') as any;
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
            text += content.items.map((s: any) => s.str).join(' ') + '\n';
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
// 指名競争入札結果カテゴリページ
const CATEGORY_URL = `${BASE_URL}/category/19-4-2-0-0-0-0-0-0-0.html`;

// スキップする工種キーワード
const SKIP_KEYWORDS = [
    '道路', '舗装', '下水道', '河川', '砂防', '水道', '管工事', '電気通信',
    '造園', '機械', '橋梁', 'カルバート', '高木', '剪定', '植樹', '護岸',
    '側溝', '水路', '調整池', 'ため池', '排水', '土木', '管渠', '維持工事',
    '鋼構造', '用水路', '農業用水',
    // 広陵町固有
    '歩道橋', '管路', '里道', 'バイパス', '樋門', '古墳', '史跡',
    '伐倒', '発掘調査', '遊具', '補償調査',
];

function shouldSkip(title: string): boolean {
    return !shouldKeepItem(title);
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

// "No3 案件名（5月13日開札）" → { no: '3', name: '案件名', date: '2025-05-13' }
function parseItem(text: string): { no: string; name: string; date: string } | null {
    const m = text.match(/^No(\d+)\s+(.+?)（(\d+)月(\d+)日開札）/);
    if (!m) return null;
    const no = m[1];
    const name = m[2].trim();
    const month = parseInt(m[3]);
    const day = parseInt(m[4]);
    const year = month >= 4 ? 2025 : 2026;
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { no, name, date };
}

export class KoryoTownScraper implements Scraper {
    municipality: '広陵町' = '広陵町';

    async scrape(): Promise<BiddingItem[]> {
        const items: BiddingItem[] = [];

        try {
            // カテゴリページから今年度URLを動的取得
            const catRes = await axios.get(CATEGORY_URL, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 15000,
            });
            const $cat = cheerio.load(catRes.data);

            let yearUrl = '';
            $cat('a[href]').each((_, el) => {
                if (yearUrl) return;
                const href = $cat(el).attr('href') || '';
                const text = $cat(el).text().trim();
                if (text.includes('令和') && text.includes('指名競争入札結果')) {
                    yearUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
                }
            });

            if (!yearUrl) {
                console.warn('[広陵町] 指名競争入札結果URLが見つかりません');
                return items;
            }
            console.log(`[広陵町] URL: ${yearUrl}`);

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
                    const parsed = parseItem(text);
                    if (!parsed) return;
                    const { no, name, date } = parsed;
                    if (!name || shouldSkip(name)) return;

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

        } catch (e: any) {
            console.error('[広陵町] エラー:', e.message || e);
        }

        console.log(`[広陵町] 合計 ${items.length} 件`);
        return items;
    }
}

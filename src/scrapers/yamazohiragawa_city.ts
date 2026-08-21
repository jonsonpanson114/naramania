import * as cheerio from 'cheerio';
import { BiddingItem, Scraper, Municipality } from '../types/bidding';
import { extractPdfText } from './common/pdf_text';
import { fetchHtml } from './common/html_fetch';

// 平群町（heguri）
const HEGURI_URL = 'https://www.town.heguri.nara.jp/soshiki/list7-1.html';
// 削除された個別記事（404）はKNOWN_HEGURI_ITEMSで補完するためリストから除外済み
const HEGURI_SUPPLEMENTAL_URLS = [
    'https://www.town.heguri.nara.jp/life/2/14/44/',
];
const YAMAZOE_NEWS_LIST_URL = 'https://www.vill.yamazoe.nara.jp/life/news';
const YAMAZOE_NEWS_URLS = [
    'https://www.vill.yamazoe.nara.jp/life/news/25298',
    'https://www.vill.yamazoe.nara.jp/life/news/25817',
];
const KNOWN_YAMAZOE_ITEMS: BiddingItem[] = [
    {
        id: '山添村-山添村立小中学校建設工事',
        municipality: '山添村',
        title: '山添村立小中学校建設工事',
        type: '建築',
        announcementDate: '2025-07-01',
        biddingDate: '2025-08-08',
        link: 'https://www.vill.yamazoe.nara.jp/life/news/25817',
        status: '落札',
        winningContractor: '藤本建設株式会社',
        winnerType: 'ゼネコン',
    },
    {
        id: '山添村-山添村義務教育学校建設基本計画業務',
        municipality: '山添村',
        title: '山添村義務教育学校建設基本計画業務',
        type: 'コンサル',
        announcementDate: '2025-02-27',
        link: 'https://www.vill.yamazoe.nara.jp/life/kurashi_guide/kosodate/gakkou/gimukyouikugakkou-setti',
        status: '受付終了',
    },
];
const KNOWN_HEGURI_ITEMS: BiddingItem[] = [
    {
        id: '平群町-平群南小学校-平群中学校屋内運動場改修工事',
        municipality: '平群町',
        title: '平群南小学校・平群中学校屋内運動場改修工事',
        type: '建築',
        announcementDate: '2025-12-22',
        link: 'https://www.town.heguri.nara.jp/life/2/14/44/',
        status: '受付終了',
    },
    {
        id: '平群町-平群町若井集会所建築工事設計業務',
        municipality: '平群町',
        title: '平群町若井集会所建築工事設計業務',
        type: 'コンサル',
        announcementDate: '2025-12-10',
        link: 'https://www.town.heguri.nara.jp/soshiki/5/16618.html',
        status: '受付終了',
    },
];

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

function parseUpdatedDate(text: string): string {
    const updatedMatch = text.match(/更新日[:：]\s*(20\d{2})年(\d{1,2})月(\d{1,2})日/);
    if (updatedMatch) {
        return `${updatedMatch[1]}-${updatedMatch[2].padStart(2, '0')}-${updatedMatch[3].padStart(2, '0')}`;
    }
    return parseJapaneseDate(text);
}

function classifyTownType(title: string, bodyText = ''): '建築' | 'コンサル' | '委託' {
    const text = `${title} ${bodyText}`;
    if (text.includes('設計') || text.includes('監理') || text.includes('コンサル')) return 'コンサル';
    if (text.includes('委託') || text.includes('業務')) return '委託';
    return '建築';
}

function parseYamazoeWinningContractor(text: string): string | undefined {
    const normalized = text.replace(/\s+/g, ' ');
    const match = normalized.match(/落札者\s*([^　 ](?:.*?))(?:\s+奈良県|\s+落札金額|\s+履行期限)/u);
    return match?.[1]?.trim() || undefined;
}

function parseYamazoeBiddingDate(text: string): string | undefined {
    const normalized = text.replace(/\s+/g, ' ');
    const match = normalized.match(/令和\s*\d+\s*年\s*\d+\s*月\s*\d+\s*日(?=に、条件付一般競争入札を執行)/u);
    return match ? parseJapaneseDate(match[0]) : undefined;
}

async function scrapeSmallTown(url: string, municipality: string): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];

    if (!url) {
        console.log(`[${municipality}] URLが設定されていません`);
        return items;
    }

    try {
        const html = await fetchHtml(url, 15000);
        const $ = cheerio.load(html);

        // 平群町：入札情報ページのリンクのみを対象とする
        // ナビゲーション・インフォリンクなどを除外する厳格なフィルタ適用
        const NON_BIDDING_NAV = [
            '地図でさがす', 'くらしの情報', 'しごとの情報', '観光情報', '町政情報',
            '本文へ', 'ご利用ガイド', 'サイトマップ', 'Foreign language', '拡大',
            '組織でさがす', 'カレンダーでさがす', 'リンク・著作権', '個人情報保護',
            'アクセシビリティ', '広告バナー', '町役場へのアクセス', 'メールでのお問い合わせ',
            '入札参加資格', '申請', '入札について',
        ];

        const articleItems = $('main a, #main a, article a, .article a, ul li a').toArray();
        for (const element of articleItems) {
            const linkEl = $(element);
            const title = linkEl.text().trim().replace(/\s+/g, ' ');
            if (!title || title.length < 6) continue;
            if (NON_BIDDING_NAV.some(kw => title.includes(kw))) continue;

            // 入札・工事・設計・委託・修繕・改修・解体を含むものだけ通す
            const POSITIVE = ['入札', '公告', '工事', '設計', '委託', '修繕', '改修', '解体', '開札結果', '落札'];
            if (!POSITIVE.some(kw => title.includes(kw))) continue;

            const hrefVal = linkEl.attr('href') || '';
            if (!hrefVal) continue;
            const updatedText = linkEl.parent().text().replace(/\s+/g, ' ');
            if (!/20\d{2}年\d{1,2}月\d{1,2}日更新/.test(updatedText)) continue;

            // 入札結果と入札公告を分類
            const isResult = title.includes('開札結果') || title.includes('落札');
            const status = isResult ? '落札' : '受付中';

            const itemId = municipality + '-' + title.slice(0, 20);
            const linkUrl = hrefVal.startsWith('http') ? hrefVal : 'https://www.town.heguri.nara.jp' + hrefVal;
            let announcementDate = '';
            let biddingDate = '';

            try {
                const detailHtml = await fetchHtml(linkUrl, 15000);
                const $ = cheerio.load(detailHtml);
                announcementDate = parseUpdatedDate($('body').text());

                const pdfHref = $('a').toArray()
                    .map(a => $(a).attr('href') || '')
                    .find(href => /\.pdf/i.test(href));
                if (pdfHref) {
                    const pdfUrl = pdfHref.startsWith('http') ? pdfHref : `https://www.town.heguri.nara.jp${pdfHref}`;
                    const pdfText = await extractPdfText(pdfUrl, 8);
                    const match = pdfText.match(/9\s*開札日時等[\s\S]*?\(\s*1\s*\)\s*開札日時\s*令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
                    if (match) {
                        const year = 2018 + parseInt(match[1], 10);
                        biddingDate = `${year}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
                    }
                }
            } catch {
                // Keep empty and fall back below.
            }

            items.push({
                id: itemId,
                municipality: municipality as Municipality,
                title: title,
                type: '建築',
                announcementDate: announcementDate || new Date().toISOString().split('T')[0],
                biddingDate: biddingDate || undefined,
                link: linkUrl,
                status: status,
                winnerType: isResult ? 'ゼネコン' : undefined,
            });
        }

    } catch (e: unknown) {
        console.error(`[${municipality}] エラー:`, e instanceof Error ? e instanceof Error ? e.message : String(e) : String(e));
    }

    console.log(`[${municipality}] 合計 ${items.length} 件`);
    return items;
}

async function scrapeHeguriSupplementalPages(): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];

    for (const url of HEGURI_SUPPLEMENTAL_URLS) {
        try {
            const html = await fetchHtml(url, 15000);
        const $ = cheerio.load(html);

            const titleCandidates = [
                $('h1').first().text(),
                $('title').first().text(),
            ].map(text => text.replace(/\s+/g, ' ').trim()).filter(Boolean);

            const pageText = $('body').text().replace(/\s+/g, ' ').trim();
            const announcementDate = parseUpdatedDate(pageText) || new Date().toISOString().split('T')[0];

            const candidateTitles = new Set<string>(titleCandidates);
            $('a').each((_, element) => {
                const text = $(element).text().replace(/\s+/g, ' ').trim();
                if (text.length >= 6) {
                    candidateTitles.add(text);
                }
            });

            for (const title of candidateTitles) {
                const isResult = /開札結果|落札/u.test(title) || /開札結果|落札/u.test(pageText);
                items.push({
                    id: `平群町-${title}`.normalize('NFKC').replace(/[^\w\u3040-\u30ff\u3400-\u9fff-]+/g, '-').slice(0, 120),
                    municipality: '平群町' as Municipality,
                    title,
                    type: title.includes('設計') ? 'コンサル' : '建築',
                    announcementDate,
                    link: url,
                    status: isResult ? '落札' : '受付中',
                    winnerType: isResult ? 'ゼネコン' : undefined,
                });
            }
        } catch (error) {
            console.warn('[平群町] 補助ページ取得エラー:', error instanceof Error ? error.message : String(error));
        }
    }

    return items;
}

// 入札案件のページか、単なる広報記事かをタイトルで判定する。
// ページ本文($('body').text())にはサイト共通ナビの「入札情報」リンクが
// 必ず含まれるため本文では判別できない。
const YAMAZOE_TENDER_TITLE = /入札|公告|開札|落札|見積|契約|公募|プロポーザル/u;

// newsリストから入札・工事関連の記事URLを自動発見する
// （固定URLだけだと年度が替わった時に新着案件を拾えない）
async function discoverYamazoeNewsUrls(): Promise<string[]> {
    const urls = new Set<string>(YAMAZOE_NEWS_URLS);
    try {
        const html = await fetchHtml(YAMAZOE_NEWS_LIST_URL, 15000);
        const $ = cheerio.load(html);
        $('a').each((_, el) => {
            const title = $(el).text().replace(/\s+/g, ' ').trim();
            const href = $(el).attr('href') || '';
            if (!/\/life\/news\/\d+/.test(href)) return;
            if (!/入札|工事/.test(title)) return;
            if (/発注見通し/.test(title)) return;
            urls.add(href.startsWith('http') ? href : `https://www.vill.yamazoe.nara.jp${href}`);
        });
    } catch (error) {
        console.warn('[山添村] newsリスト取得エラー:', error instanceof Error ? error.message : String(error));
    }
    return Array.from(urls);
}

async function scrapeYamazoeVillage(): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];

    for (const url of await discoverYamazoeNewsUrls()) {
        try {
            const html = await fetchHtml(url, 15000);
        const $ = cheerio.load(html);
            const title = $('h1').first().text().replace(/\s+/g, ' ').trim();
            const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
            if (!title) continue;
            // 「◯◯工事の進捗状況」のような広報記事は入札案件ではない。URL発見側は
            // 「入札|工事」で拾うため工事の進捗報告まで入ってくる。以前は
            // shouldKeepItem がこれらを結果的に弾いていたが、建築関連性の判定を
            // index.ts に一元化した際に一緒に外れ、進捗報告や学校建設の告知ページが
            // 「落札」扱い・開札日なしで混入して品質チェックを落としていた。
            if (!YAMAZOE_TENDER_TITLE.test(title)) continue;

            const announcementDate = parseUpdatedDate(bodyText) || new Date().toISOString().split('T')[0];
            const biddingDate = parseYamazoeBiddingDate(bodyText);
            // 結果ページか公告ページかはタイトルで判定する。bodyText はサイト共通ナビに
            // 他記事の「〜結果について」リンクを含むため、公告ページまで結果扱いになり
            // 「落札なのに開札日がない」案件を作ってしまう。
            const isResult = /結果|落札/u.test(title);

            items.push({
                id: `山添村-${title}`.normalize('NFKC').replace(/[^\w\u3040-\u30ff\u3400-\u9fff-]+/g, '-').slice(0, 120),
                municipality: '山添村',
                title: title.replace(/における一般競争入札の結果について/u, '').replace(/の一般競争入札について/u, '').trim(),
                type: classifyTownType(title, bodyText),
                announcementDate,
                biddingDate,
                link: url,
                status: isResult ? '落札' : '受付中',
                winningContractor: isResult ? parseYamazoeWinningContractor(bodyText) : undefined,
                winnerType: isResult ? 'ゼネコン' : undefined,
            });
        } catch (error) {
            console.warn('[山添村] ページ取得エラー:', error instanceof Error ? error.message : String(error));
        }
    }

    return items;
}

export class YamazomuraScraper implements Scraper {
    municipality: '山添村' = '山添村' as const;

    async scrape(): Promise<BiddingItem[]> {
        const items = await scrapeYamazoeVillage();
        for (const knownItem of KNOWN_YAMAZOE_ITEMS) {
            if (!items.some(item => item.title === knownItem.title)) {
                items.push(knownItem);
            }
        }
        console.log(`[山添村] 合計 ${items.length} 件`);
        return items;
    }
}

export class HiragawaScraper implements Scraper {
    municipality: '平群町' = '平群町' as const;

    async scrape(): Promise<BiddingItem[]> {
        const baseItems = await scrapeSmallTown(HEGURI_URL, '平群町');
        const merged = new Map(baseItems.map(item => [item.title, item]));
        const supplementalItems = await scrapeHeguriSupplementalPages();
        for (const item of supplementalItems) {
            merged.set(item.title, item);
        }
        for (const knownItem of KNOWN_HEGURI_ITEMS) {
            if (!merged.has(knownItem.title)) {
                merged.set(knownItem.title, knownItem);
            }
        }
        const items = Array.from(merged.values());
        console.log(`[平群町] 補助込み合計 ${items.length} 件`);
        return items;
    }
}

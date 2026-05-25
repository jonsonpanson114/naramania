import axios from 'axios';
import * as cheerio from 'cheerio';
import { BiddingItem, Scraper } from '../types/bidding';
import { isRealBiddingItem, classifyWinner, shouldKeepItem } from './common/filter';
import { extractPdfText, parseJapaneseDateToIso } from './common/pdf_text';

// 御所市
const RSS_URL = 'https://www.city.gose.nara.jp/rss/rss.xml';
const GOSE_CATEGORY_URL = 'https://www.city.gose.nara.jp/category/6-9-0-0-0-0-0-0-0-0.html';
const GOSE_PROPOSAL_FALLBACKS: Record<string, { link: string; biddingDate: string }> = {
    '御所市義務教育学校建設に関する基本設計及び実施設計業務に係る公募型プロポーザル': {
        link: 'https://www.city.gose.nara.jp/0000004589.html',
        biddingDate: '2026-07-29',
    },
};

function classifyType(title: string): '建築' | 'コンサル' | 'その他' {
    if (title.includes('設計') || title.includes('測量') || title.includes('コンサル')) {
        return 'コンサル';
    }
    if (title.includes('建築') || title.includes('工事')) {
        return '建築';
    }
    return 'その他';
}

function parseRssDate(dateStr: string): string {
    // "Fri, 21 Feb 2025 12:00:00 JST" -> "2025-02-21"
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
}

function parsePublicDateText(text: string): string {
    const match = text.match(/(?:公開日|更新日)[：:\s]*((?:20\d{2}|令和\s*\d+)\s*年\s*\d+\s*月\s*\d+\s*日)/u);
    if (!match) return '';
    return parseJapaneseDateToIso(match[1]) || '';
}

function normalizeGoseLink(href: string): string {
    if (!href) return '';
    if (href.startsWith('http')) return href;
    return `https://www.city.gose.nara.jp${href}`;
}

function buildGoseId(title: string, announcementDate: string, suffix = ''): string {
    return `gose-${announcementDate || 'nodate'}-${title.slice(0, 24)}${suffix}`;
}

type GoseDetailRecord = {
    title: string;
    announcementDate?: string;
    biddingDate?: string;
    winningContractor?: string;
    status?: '受付中' | '受付終了' | '落札';
};

function extractGoseDetailRecords(html: string): GoseDetailRecord[] {
    const $ = cheerio.load(html);
    const blocks: GoseDetailRecord[] = [];
    let current: GoseDetailRecord = { title: '' };

    const pushCurrent = () => {
        if (!current.title) return;
        blocks.push({ ...current });
        current = { title: '' };
    };

    $('table').each((_, table) => {
        const rows = $(table).find('tr').toArray();
        if (rows.length === 0) return;

        for (const row of rows) {
            const cells = $(row).find('th,td').toArray().map(cell =>
                $(cell).text().replace(/\s+/g, ' ').trim(),
            );
            if (cells.length < 2) continue;

            const label = cells[0];
            const value = cells.slice(1).join(' ').trim();
            if (!value) continue;

            if (/(工事名|業務委託等名|業務名|委託名|件名)/u.test(label)) {
                if (current.title && current.title !== value) pushCurrent();
                current.title = value;
                continue;
            }
            if (/公告日/u.test(label)) {
                current.announcementDate = parseJapaneseDateToIso(value) || current.announcementDate;
                continue;
            }
            if (/(開札日|入札日|プレゼンテーション・ヒアリング実施)/u.test(label)) {
                current.biddingDate = parseJapaneseDateToIso(value) || current.biddingDate;
                continue;
            }
            if (/(落札業者|落札者)/u.test(label)) {
                current.winningContractor = value;
            }
        }
        pushCurrent();
    });

    return blocks;
}

function parseGoseResultPdfDate(label: string): string {
    const full = parseJapaneseDateToIso(label);
    if (full) return full;

    const partial = label.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/u);
    if (!partial) return '';
    return parseJapaneseDateToIso(partial[0]) || '';
}

function extractGoseResultPdfRecords(pdfText: string, biddingDate: string): GoseDetailRecord[] {
    const normalized = pdfText.replace(/\s+/g, ' ').trim();
    const blocks = normalized.split(/公\s*表\s*開\s*札\s*録/u).map(part => part.trim()).filter(Boolean);
    const records: GoseDetailRecord[] = [];

    for (const block of blocks) {
        const titleMatch = block.match(/入札執行\s+(.+?)\s+[^\s]{2,6}\s+御所市/u);
        const winnerMatch = block.match(/有\s+[0-9,]+\s+円?\s+(.+?)\s+落札率/u);
        const title = titleMatch?.[1]?.trim().replace(/\s+/g, ' ');
        const winningContractor = winnerMatch?.[1]?.trim().replace(/\s+/g, ' ');
        if (!title || !shouldKeepItem(title)) continue;

        records.push({
            title,
            announcementDate: biddingDate,
            biddingDate,
            winningContractor,
            status: winningContractor ? '落札' : '受付終了',
        });
    }

    return records;
}

async function extractProposalReviewDate(link: string): Promise<string | undefined> {
    try {
        const res = await axios.get(link, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000,
        });
        const $ = cheerio.load(res.data);
        const text = $('body').text().replace(/\s+/g, ' ');
        const scheduleMatch = text.match(/プレゼンテーション・ヒアリング実施\s*令和\s*\d+\s*年\s*\d+\s*月\s*\d+\s*日/u);
        return scheduleMatch ? parseJapaneseDateToIso(scheduleMatch[0]) || undefined : undefined;
    } catch {
        return undefined;
    }
}

async function scrapeGoseCategoryLinks(items: BiddingItem[]): Promise<void> {
    const categoryRes = await axios.get(GOSE_CATEGORY_URL, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000,
    });
    const $ = cheerio.load(categoryRes.data);
    const seenLinks = new Set<string>();

    const links = $('a').toArray().map(el => ({
        title: $(el).text().replace(/\s+/g, ' ').trim(),
        href: normalizeGoseLink($(el).attr('href') || ''),
    })).filter(link =>
        link.href &&
        !seenLinks.has(link.href) &&
        (
            link.title.includes('一般競争入札公告（建設工事）') ||
            link.title.includes('一般競争入札公告（建設コンサルタント等）') ||
            link.title.includes('建設工事等の入札結果の公表') ||
            link.title.includes('御所市義務教育学校建設に関する基本設計及び実施設計業務')
        ),
    );

    for (const link of links) {
        seenLinks.add(link.href);
        try {
            const detailRes = await axios.get(link.href, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 15000,
            });
            const detailHtml = detailRes.data as string;
            const detailDate = parsePublicDateText(detailHtml);
            const detailRecords = extractGoseDetailRecords(detailHtml);
            const $detail = cheerio.load(detailHtml);

            const pdfRecords: GoseDetailRecord[] = [];
            if (link.title.includes('入札結果')) {
                const pdfLinks = $detail('a').toArray().map(el => ({
                    href: normalizeGoseLink($detail(el).attr('href') || ''),
                    label: $detail(el).text().replace(/\s+/g, ' ').trim(),
                })).filter(pdf => pdf.href.toLowerCase().includes('.pdf'));

                for (const pdf of pdfLinks.slice(-4)) {
                    try {
                        const pdfText = await extractPdfText(pdf.href, 8);
                        const pdfDate = parseGoseResultPdfDate(pdf.label) || detailDate;
                        pdfRecords.push(...extractGoseResultPdfRecords(pdfText, pdfDate));
                    } catch {
                        continue;
                    }
                }
            }

            const mergedRecords = [...detailRecords, ...pdfRecords];

            if (mergedRecords.length === 0 && shouldKeepItem(link.title)) {
                items.push({
                    id: buildGoseId(link.title, detailDate, '-fallback'),
                    municipality: '御所市',
                    title: link.title,
                    type: classifyType(link.title),
                    announcementDate: detailDate || new Date().toISOString().split('T')[0],
                    link: link.href,
                    status: link.title.includes('結果') ? '落札' : '受付中',
                });
                continue;
            }

            mergedRecords.forEach((record, index) => {
                if (!shouldKeepItem(record.title)) return;
                items.push({
                    id: buildGoseId(record.title, record.announcementDate || detailDate, `-${index}`),
                    municipality: '御所市',
                    title: record.title,
                    type: classifyType(record.title),
                    announcementDate: record.announcementDate || detailDate || new Date().toISOString().split('T')[0],
                    biddingDate: record.biddingDate,
                    link: link.href,
                    status: record.status || (record.winningContractor ? '落札' : (link.title.includes('結果') ? '受付終了' : '受付中')),
                    winningContractor: record.winningContractor,
                    winnerType: classifyWinner(record.winningContractor || ''),
                });
            });
        } catch {
            continue;
        }
    }
}

async function scrapeGoseCity(): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];

    try {
        await scrapeGoseCategoryLinks(items);

        // RSSフィードを取得
        const res = await axios.get(RSS_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000,
        });
        const $ = cheerio.load(res.data);

        // RSS itemの抽出
        const rssItems = $('item').toArray();
        for (let index = 0; index < rssItems.length; index++) {
            const el = rssItems[index];
            const title = $(el).find('title').text().trim();
            const link = $(el).find('link').text().trim() || $(el).find('link').attr('href') || '';
            if (!title) continue;

            // ①入札・工事関連キーワードがあるか確認
            if (!isRealBiddingItem(title)) continue;

            // ②「入札そのもの」ではないページを除外（ダウンロード案内、申請ガイドなど）
            const NON_BIDDING_PATTERNS = [
                'ダウンロードについて', '入札参加資格', '申請・変更', '申請について',
                '一般競争入札公告（業務委託等）', // 汎用案内ページ
            ];
            if (NON_BIDDING_PATTERNS.some(p => title.includes(p))) continue;

            // ③ NGワードフィルター（共通）
            if (!shouldKeepItem(title)) continue;

            const pubDateStr = $(el).find('pubDate').text().trim();
            const announcementDate = parseRssDate(pubDateStr) || parseRssDate(new Date().toString());
            const proposalFallback = GOSE_PROPOSAL_FALLBACKS[title];
            const resolvedLink = link || proposalFallback?.link || '';
            const biddingDate = title.includes('プロポーザル') && resolvedLink
                ? await extractProposalReviewDate(resolvedLink).then(date => date || proposalFallback?.biddingDate)
                : undefined;

            const winningContractor = title.includes('落札') ? title.split('：').pop()?.trim() : undefined;
            items.push({
                id: `gose-${title.slice(0, 20)}-${index}`,
                municipality: '御所市',
                title,
                type: classifyType(title),
                announcementDate: announcementDate,
                biddingDate,
                link: resolvedLink,
                status: title.includes('落札') ? '落札' : '受付中',
                winningContractor: winningContractor,
                winnerType: classifyWinner(winningContractor || '')
            });
        }

    } catch (e: unknown) {
        console.error('[御所市] エラー:', e instanceof Error ? e.message : String(e) || e);
    }

    console.log(`[御所市] 合計 ${items.length} 件`);
    return items;
}

export class GoseCityScraper implements Scraper {
    municipality: '御所市' = '御所市' as const;

    async scrape(): Promise<BiddingItem[]> {
        return scrapeGoseCity();
    }
}

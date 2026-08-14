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
    // RSSのlinkが空で流れてくるため、公開ページのURLを補完する
    '（仮称）御所市北部認定こども園整備工事設計業務委託に係る公募型プロポーザル': {
        link: 'https://www.city.gose.nara.jp/0000004649.html',
        biddingDate: '',
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

/**
 * 通常は「部署コード 御所市...」と続くが、案件によっては部署コードの直後に
 * 金額列(カンマ区切りの数値)が挟まり、御所市が後方に出現することがある。
 * その場合タイトル抽出の正規表現が金額まで飲み込むため、
 * 「部署コード＋カンマ区切り数値」以降を切り落として防御する。
 */
function sanitizeExtractedTitle(title: string): string {
    return title.replace(/\s+\S{1,4}\s+[0-9]{1,3}(,[0-9]{3}).*$/u, '').trim();
}

function extractGoseResultPdfRecords(pdfText: string, biddingDate: string): GoseDetailRecord[] {
    const normalized = pdfText.replace(/\s+/g, ' ').trim();
    const blocks = normalized.split(/公\s*表\s*開\s*札\s*録/u).map(part => part.trim()).filter(Boolean);
    const records: GoseDetailRecord[] = [];

    for (const block of blocks) {
        const titleMatch = block.match(/入札執行\s+(.+?)\s+[^\s]{2,6}\s+御所市/u);
        // 「落札(候補)金額」欄は"円"が付かないことが多い(例:「有 6,400,000 (株)阪本」)。
        // 旧パターン(\s+円?\s+)は"円"が無い場合に空白2回分を要求してしまい常に
        // マッチしなかった(normalizeで空白は1個に潰れているため)。\s*に緩和。
        // さらに、PDFのテキスト抽出順は様式のフィールド順と一致せず、案件によっては
        // 落札者名の直後に「履行場所(御所市大字...)」を含む別フィールド群が
        // 挟まってから「落札率」に到達する。「落札率」だけを終端にすると、その
        // 間の文字列(他の入札者情報等)まで丸ごと拾ってしまうため、次の
        // フィールドの先頭である「御所市」も終端候補に加える。
        const winnerMatch = block.match(/有\s+[0-9,]+\s*円?\s+(.+?)(?:\s+御所市|\s+落札率)/u);
        const title = sanitizeExtractedTitle(titleMatch?.[1]?.trim().replace(/\s+/g, ' ') || '');
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

type ProposalPageDetails = {
    biddingDate?: string;
    winningContractor?: string;
};

/**
 * プロポーザルの詳細ページから審査(開札相当)日と、公表済みなら優先交渉権者を読む。
 * このページは「実施のお知らせ」→「質問への回答」→「選定結果の公表」と同じURLのまま
 * 内容が更新されていくため、ページの[公開日/更新日]は結果公表のたびに新しくなる。
 * これをそのまま announcementDate に使うと、審査日(biddingDate相当)より後の日付になり、
 * 「公告日が開札日より後」という整合性エラーでCIが落ちる。
 */
function parseProposalPageDetails(html: string): ProposalPageDetails {
    const $ = cheerio.load(html);
    const text = $('body').text().replace(/\s+/g, ' ');
    const scheduleMatch = text.match(/プレゼンテーション・ヒアリング実施\s*令和\s*\d+\s*年\s*\d+\s*月\s*\d+\s*日/u);
    const winnerMatch = text.match(/優先交渉権者[：:]([^（）:：]+)/u);
    return {
        biddingDate: scheduleMatch ? parseJapaneseDateToIso(scheduleMatch[0]) || undefined : undefined,
        winningContractor: winnerMatch?.[1]?.trim() || undefined,
    };
}

async function extractProposalPageDetails(link: string): Promise<ProposalPageDetails> {
    try {
        const res = await axios.get(link, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000,
        });
        return parseProposalPageDetails(res.data);
    } catch {
        return {};
    }
}

/**
 * announcementDate は「ページの[公開日/更新日]」や「RSSのpubDate」から取っているため、
 * 選定結果の公表などページが後から更新されると開札相当日(biddingDate)より後になり得る。
 * announcementDate が biddingDate を超えないようクランプする。
 */
function clampAnnouncementDate(announcementDate: string, biddingDate: string | undefined): string {
    if (biddingDate && announcementDate > biddingDate) return biddingDate;
    return announcementDate;
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
                const proposalDetails = link.title.includes('プロポーザル')
                    ? parseProposalPageDetails(detailHtml)
                    : {};
                const rawAnnouncementDate = detailDate || new Date().toISOString().split('T')[0];
                items.push({
                    id: buildGoseId(link.title, detailDate, '-fallback'),
                    municipality: '御所市',
                    title: link.title,
                    type: classifyType(link.title),
                    announcementDate: clampAnnouncementDate(rawAnnouncementDate, proposalDetails.biddingDate),
                    biddingDate: proposalDetails.biddingDate,
                    link: link.href,
                    status: proposalDetails.winningContractor
                        ? '落札'
                        : (link.title.includes('結果') ? '落札' : '受付中'),
                    winningContractor: proposalDetails.winningContractor,
                    winnerType: classifyWinner(proposalDetails.winningContractor || ''),
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
            const rawAnnouncementDate = parseRssDate(pubDateStr) || parseRssDate(new Date().toString());
            const proposalFallback = GOSE_PROPOSAL_FALLBACKS[title];
            const resolvedLink = link || proposalFallback?.link || '';
            const proposalDetails = title.includes('プロポーザル') && resolvedLink
                ? await extractProposalPageDetails(resolvedLink)
                : {};
            const biddingDate = proposalDetails.biddingDate || proposalFallback?.biddingDate;

            const winningContractor = (title.includes('落札') ? title.split('：').pop()?.trim() : undefined)
                || proposalDetails.winningContractor;
            items.push({
                id: `gose-${title.slice(0, 20)}-${index}`,
                municipality: '御所市',
                title,
                type: classifyType(title),
                announcementDate: clampAnnouncementDate(rawAnnouncementDate, biddingDate),
                biddingDate,
                link: resolvedLink,
                status: (title.includes('落札') || winningContractor) ? '落札' : '受付中',
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

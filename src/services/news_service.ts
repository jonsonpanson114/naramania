import axios from 'axios';
import * as cheerio from 'cheerio';
import { fetchNewsViaBrowser } from './news_browser_service';

/** 記事本文から読み取った落札・選定の結果 */
export interface NewsResultEntry {
    kind: '落札' | '選定';
    contractor: string;
    /** 原文の表記を半角化しただけのもの（例: 1億2800万円） */
    amount?: string;
}

export interface NewsItem {
    id: string;
    source: string;
    sourceLabel: string;
    title: string;
    date: string;
    link: string;
    excerpt?: string;
    category?: 'construction' | 'general';
    relevanceScore?: number;
    /** 発注者・自治体（例: 近畿地方整備局、県立医科大学、御所市） */
    orderer?: string;
    /** 記事から抽出した落札者・落札金額。公告記事では空になる */
    results?: NewsResultEntry[];
}

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
};

const CONSTRUCTION_NEWS_SOURCES = new Set(['constnews', 'kentsu', 'decn']);
const CONSTRUCTION_NEWS_KEYWORDS = [
    '入札', '公告', '落札', '契約', '発注', '工事', '設計', '建設', '建築', '改修',
    '新築', '解体', '耐震', '庁舎', '校舎', '学校', '体育館', '公共施設', '再整備',
    'PFI', 'DB', '基本計画', '基本設計', '実施設計', '施工', '業務委託',
];
const GENERAL_NEWS_NOISE_KEYWORDS = [
    '人事', '選挙', '事件', '事故', '観光', 'スポーツ', '文化財', '博物館',
    'グルメ', 'イベント', '祭り', '訃報',
];

async function fetchUrl(url: string): Promise<string> {
    const res = await axios.get<ArrayBuffer>(url, {
        headers: HEADERS,
        timeout: 15000,
        maxRedirects: 3,
        responseType: 'arraybuffer',
    });
    const buffer = Buffer.from(res.data);
    const contentType = typeof res.headers['content-type'] === 'string' ? res.headers['content-type'] : '';
    return decodeHtml(buffer, contentType);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((resolve) => {
                timer = setTimeout(() => resolve(fallback), timeoutMs);
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/** ローカル日付で YYYY-MM-DD を組み立てる（toISOString はUTCへずれるため使わない） */
function formatLocalDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function parseRssDate(dateStr: string): string {
    try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) return formatLocalDate(d);
    } catch { }
    return '';
}

/**
 * 各紙で表記がまちまちな日付文字列から YYYY-MM-DD を取り出す。
 * 例: 「2026年8月7日 [2面]」「2026.08.10」「2026/8/7」「社会2026.08.16」
 */
function parseFlexibleDate(text: string): string {
    if (!text) return '';
    const normalized = text.replace(/\s+/g, '');

    const ymd = normalized.match(/(\d{4})[年.\-/](\d{1,2})[月.\-/](\d{1,2})/);
    if (ymd) {
        const [, y, m, d] = ymd;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // 記事URLに埋め込まれた 20260816211249 のような形式
    const compact = normalized.match(/(20\d{2})(\d{2})(\d{2})\d{0,6}/);
    if (compact) {
        const [, y, m, d] = compact;
        const month = Number(m);
        const day = Number(d);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${y}-${m}-${d}`;
    }

    return '';
}

function stripHtml(html: string): string {
    return html
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeCharset(value: string): string {
    const charset = value.trim().toLowerCase().replace(/["']/g, '');
    if (['shift-jis', 'shift_jis', 'sjis', 'windows-31j', 'cp932'].includes(charset)) return 'shift_jis';
    if (['euc-jp', 'euc_jp'].includes(charset)) return 'euc-jp';
    if (['utf8', 'utf-8'].includes(charset)) return 'utf-8';
    if (['iso-2022-jp', 'jis'].includes(charset)) return 'iso-2022-jp';
    return charset || 'utf-8';
}

function detectCharset(buffer: Buffer, contentType: string): string {
    const headerMatch = contentType.match(/charset=([^;\s]+)/i);
    if (headerMatch) return normalizeCharset(headerMatch[1]);

    const head = buffer.subarray(0, 4096).toString('latin1');
    const metaMatch = head.match(/charset=["']?\s*([^"'\s/>]+)/i) || head.match(/encoding=["']?\s*([^"'\s?>]+)/i);
    if (metaMatch) return normalizeCharset(metaMatch[1]);

    return 'utf-8';
}

function decodeHtml(buffer: Buffer, contentType: string): string {
    const charset = detectCharset(buffer, contentType);
    const candidates = Array.from(new Set([charset, 'utf-8', 'shift_jis', 'euc-jp']));

    let best = '';
    let bestScore = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
        try {
            const decoded = new TextDecoder(candidate).decode(buffer);
            const score = (decoded.match(/\uFFFD/g) || []).length
                + (decoded.match(/[縺繧譁蟒螂蜊莉]/g) || []).length * 0.4;
            if (score < bestScore) {
                best = decoded;
                bestScore = score;
            }
        } catch {
            // Unsupported labels are ignored; TextDecoder supports the Japanese encodings we use above.
        }
    }

    return best || new TextDecoder('utf-8').decode(buffer);
}

function normalizeLink(href: string, baseUrl: string): string {
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return '';
    try {
        return new URL(href, baseUrl).toString();
    } catch {
        return '';
    }
}

function isNoiseTitle(title: string): boolean {
    if (title.length < 6 || title.length > 140) return true;
    if (/[�]/.test(title)) return true;
    if ((title.match(/[縺繧譁蟒螂]/g) || []).length >= 3) return true;
    return /^(ホーム|トップ|一覧|検索|ログイン|購読|広告|お問い合わせ|会社案内|サイトマップ|プライバシー|会員|有料記事)/.test(title);
}

function cleanTitle(title: string): string {
    return stripHtml(title)
        .replace(/\s*\|\s*.*$/, '')
        .replace(/\s+-\s+.*$/, '')
        .trim();
}

function toHalfWidthDigits(s: string): string {
    return s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

/**
 * 「▼工事名（橿原市小槻町）＝清川組」「入札は中和・中川ＪＶ」のような
 * 前置きが付いた状態から業者名だけを取り出す。
 */
function cleanEntityName(raw: string): string {
    let s = raw.trim();
    const eq = s.lastIndexOf('＝');
    if (eq >= 0) s = s.slice(eq + 1);
    const paren = s.lastIndexOf('）');
    if (paren >= 0) s = s.slice(paren + 1);
    s = s.replace(/^(?:にて|では|には|からは|より)/, '');
    s = s.replace(/^[はがのをにでとへやも、。・「」\s]+/, '');
    return s.trim();
}

const AWARD_PATTERN = /([^\s、。「」]{2,30})が([０-９0-9]+(?:億)?[０-９0-9]*(?:万)?[０-９0-9]*円)(?:（[^）]*）)?で落札/g;
const SELECT_PATTERNS = [
    /([^\s、。「」（(]{2,28})を(?:優先交渉権者|受託候補者|落札候補者|契約候補者|受託者|受注者)に(?:特定|選定|決定)/g,
    /(?:受託者|受注者|受託候補者)に([^、。]{2,40}?)を(?:特定|選定|決定)/g,
    /[、。」]([^\s、。「」（(]{2,28})を選定した/g,
    /([^\s、。「」（(]{2,28})に業務を委託/g,
];

/** 記事本文から落札者・落札金額（無ければ選定業者）を抜き出す */
function extractResults(text: string): NewsResultEntry[] {
    if (!text) return [];
    const results: NewsResultEntry[] = [];
    const seen = new Set<string>();

    for (const m of text.matchAll(AWARD_PATTERN)) {
        const contractor = cleanEntityName(m[1]);
        if (!contractor || seen.has(contractor)) continue;
        seen.add(contractor);
        results.push({ kind: '落札', contractor, amount: toHalfWidthDigits(m[2]) });
    }

    for (const pattern of SELECT_PATTERNS) {
        for (const m of text.matchAll(pattern)) {
            const contractor = cleanEntityName(m[1]);
            if (!contractor || seen.has(contractor)) continue;
            seen.add(contractor);
            results.push({ kind: '選定', contractor });
        }
    }

    return results.slice(0, 4);
}

/** 「奈良県御所市は、…」「横浜市は「◯◯事業」…」のような書き出しから発注者を拾う */
function extractOrderer(text: string): string | undefined {
    const m = text.match(/^([^、。\s]{2,20}?)は/);
    const name = m?.[1]?.trim();
    if (!name || name.length < 2) return undefined;
    // 「これ」「同社」など発注者ではない語を弾く
    if (/^(これ|それ|同社|同市|同町|今回|一方|なお)$/.test(name)) return undefined;
    return name;
}

function scoreConstructionNews(item: Pick<NewsItem, 'source' | 'title' | 'excerpt'>): number {
    const text = `${item.title} ${item.excerpt || ''}`;
    let score = CONSTRUCTION_NEWS_SOURCES.has(item.source) ? 6 : 0;
    for (const keyword of CONSTRUCTION_NEWS_KEYWORDS) {
        if (text.includes(keyword)) score += 2;
    }
    for (const keyword of GENERAL_NEWS_NOISE_KEYWORDS) {
        if (text.includes(keyword)) score -= 2;
    }
    return score;
}

function enrichNewsItem(item: NewsItem): NewsItem | null {
    const title = cleanTitle(item.title);
    const link = normalizeLink(item.link, item.link);
    if (isNoiseTitle(title) || !link) return null;

    const relevanceScore = scoreConstructionNews({ ...item, title });
    const category = relevanceScore >= 4 ? 'construction' : 'general';

    // 新報奈良は取得時に本文全文から抽出済み。他紙は抜粋から拾えるだけ拾う。
    const results = item.results?.length
        ? item.results
        : extractResults(`${title} ${item.excerpt ?? ''}`);
    const orderer = item.orderer || extractOrderer(item.excerpt ?? '');

    return {
        ...item,
        title,
        link,
        category,
        relevanceScore,
        results,
        orderer,
    };
}

// 新報奈良 (shinpou-nara.com) — WordPress RSS
async function fetchShinpouNara(): Promise<NewsItem[]> {
    try {
        const xml = await fetchUrl('https://shinpou-nara.com/feed/');
        const $ = cheerio.load(xml, { xmlMode: true });
        const items: NewsItem[] = [];
        $('item').each((i, el) => {
            if (i >= 10) return false;
            const title = stripHtml($(el).find('title').text().trim());
            const link = normalizeLink($(el).find('link').text().trim() || $(el).find('guid').text().trim(), 'https://shinpou-nara.com/');
            const pubDate = $(el).find('pubDate').text().trim();
            if (isNoiseTitle(title) || !link) return;

            // content:encoded に本文全文が入る。コロン付きタグは
            // セレクタで扱えないため子要素を走査して取り出す。
            const encoded = $(el).children()
                .filter((_, child) => (child as { tagName?: string }).tagName === 'content:encoded')
                .first().text();
            const body = stripHtml(encoded || $(el).find('description').text());

            // category は発注者名（近畿地方整備局・県立医科大学 など）が入る
            const orderer = stripHtml($(el).find('category').first().text()) || undefined;

            items.push({
                id: `shinpou-${i}`,
                source: 'shinpou',
                sourceLabel: '新報奈良',
                title,
                date: parseRssDate(pubDate),
                link,
                excerpt: body.slice(0, 140) || undefined,
                orderer,
                results: extractResults(`${title} ${body}`),
            });
        });
        const withResult = items.filter(i => i.results && i.results.length > 0).length;
        console.log(`[News] 新報奈良: ${items.length}件（落札・選定を抽出 ${withResult}件）`);
        return items;
    } catch (e) {
        console.warn('[News] 新報奈良 エラー:', (e as Error).message);
        return [];
    }
}

// 日刊建設工業新聞 (decn.co.jp) — 奈良検索HTML
async function fetchDecn(): Promise<NewsItem[]> {
    try {
        const html = await fetchUrl('https://www.decn.co.jp/?s=%E5%A5%88%E8%89%AF');
        const $ = cheerio.load(html);
        const items: NewsItem[] = [];
        const seenLinks = new Set<string>();

        // 1記事 = .topNewsCatBox（見出し・日付・本文が兄弟要素として並ぶ）
        $('.topNewsCatBox').each((_, box) => {
            if (items.length >= 10) return false;
            const $box = $(box);

            const anchor = $box.find('.topTitle a').filter((_, a) => $(a).text().trim().length > 0).first();
            const title = cleanTitle(anchor.text().trim());
            const href = normalizeLink(anchor.attr('href') || '', 'https://www.decn.co.jp/');
            if (isNoiseTitle(title) || !href || seenLinks.has(href)) return;
            seenLinks.add(href);

            // 「2026年8月7日 [2面]」形式
            const date = parseFlexibleDate($box.find('.topNewsCatData .date').text());
            const excerpt = stripHtml($box.find('.topText .Text').text()).slice(0, 120);

            items.push({
                id: `decn-${items.length}`,
                source: 'decn',
                sourceLabel: '建設工業新聞',
                title,
                date,
                link: href,
                excerpt: excerpt || undefined,
            });
        });

        console.log(`[News] 建設工業新聞: ${items.length}件（日付あり ${items.filter(i => i.date).length}件）`);
        return items;
    } catch (e) {
        console.warn('[News] 建設工業新聞 エラー:', (e as Error).message);
        return [];
    }
}

// 奈良新聞 (nara-np.co.jp) — RSS優先、HTMLフォールバック
async function fetchNaraNp(): Promise<NewsItem[]> {
    // RSS試行
    try {
        const xml = await fetchUrl('https://www.nara-np.co.jp/feed/');
        const $ = cheerio.load(xml, { xmlMode: true });
        const items: NewsItem[] = [];
        $('item').each((i, el) => {
            if (i >= 15) return false;
            const title = stripHtml($(el).find('title').text().trim());
            const link = normalizeLink($(el).find('link').text().trim() || $(el).find('guid').text().trim(), 'https://www.nara-np.co.jp/');
            const pubDate = $(el).find('pubDate').text().trim();
            const description = stripHtml($(el).find('description').text()).slice(0, 100);
            if (isNoiseTitle(title) || !link) return;
            items.push({ id: `naranp-${i}`, source: 'naranp', sourceLabel: '奈良新聞', title, date: parseRssDate(pubDate), link, excerpt: description || undefined });
        });
        if (items.length > 0) {
            console.log(`[News] 奈良新聞(RSS): ${items.length}件`);
            return items;
        }
    } catch { }

    // HTMLフォールバック
    try {
        const html = await fetchUrl('https://www.nara-np.co.jp/');
        const $ = cheerio.load(html);
        const items: NewsItem[] = [];
        const seenLinks = new Set<string>();

        // 記事カードは必ず日付要素(p.date)を持つ。これを起点にすると
        // ナビゲーションのカテゴリリンク（「ならリビング」等）を拾わずに済む。
        $('p.date, .date').each((_, dateEl) => {
            if (items.length >= 15) return false;
            const anchor = $(dateEl).closest('a');
            if (!anchor.length) return;

            const href = anchor.attr('href') || '';
            const fullHref = normalizeLink(href, 'https://www.nara-np.co.jp/');
            if (!fullHref || seenLinks.has(fullHref)) return;

            const title = cleanTitle(anchor.find('h3.title, p.title, .title').first().text().trim());
            if (isNoiseTitle(title)) return;
            seenLinks.add(fullHref);

            // 「社会2026.08.16」からカテゴリを除いた日付部分を取る。
            // 取れない場合は記事URL(/news/20260816211249.html)から補う。
            const date = parseFlexibleDate($(dateEl).text()) || parseFlexibleDate(href);
            const excerpt = stripHtml(anchor.find('p.lead').first().text()).slice(0, 120);

            items.push({
                id: `naranp-${items.length}`,
                source: 'naranp',
                sourceLabel: '奈良新聞',
                title,
                date,
                link: fullHref,
                excerpt: excerpt || undefined,
            });
        });

        console.log(`[News] 奈良新聞(HTML): ${items.length}件（日付あり ${items.filter(i => i.date).length}件）`);
        return items;
    } catch (e) {
        console.warn('[News] 奈良新聞 エラー:', (e as Error).message);
        return [];
    }
}

export async function fetchAllNews(): Promise<NewsItem[]> {
    const results = await Promise.allSettled([
        fetchShinpouNara(),
        fetchDecn(),
        fetchNaraNp(),
        withTimeout(fetchNewsViaBrowser(), 22000, []), // 建設ニュースと建通新聞はブラウザ経由
    ]);

    const allItems: NewsItem[] = [];
    for (const result of results) {
        if (result.status === 'fulfilled') {
            allItems.push(...result.value);
        }
    }

    // 重複削除 (URLベース)
    const unique = new Map<string, NewsItem>();
    allItems.forEach(item => {
        const enriched = enrichNewsItem(item);
        if (!enriched) return;
        const key = enriched.link || `${enriched.source}:${enriched.title}`;
        if (!unique.has(key)) {
            unique.set(key, enriched);
        }
    });

    const finalItems = Array.from(unique.values());
    // 建設系を先に、その中では新しい記事順。日付が取れなかったものは末尾に回す。
    finalItems.sort((a, b) => {
        const categoryRank = (b.category === 'construction' ? 1 : 0) - (a.category === 'construction' ? 1 : 0);
        if (categoryRank !== 0) return categoryRank;
        const dateRank = (b.date || '').localeCompare(a.date || '');
        if (dateRank !== 0) return dateRank;
        return (b.relevanceScore || 0) - (a.relevanceScore || 0);
    });
    return finalItems;
}

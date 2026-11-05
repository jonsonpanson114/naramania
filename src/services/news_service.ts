import crypto from 'crypto';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { addDaysJstDateKey, toJstDateKey } from '../lib/jst_date';

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
    /** Googleニュース経由の記事の、実際の掲載元(朝日新聞など) */
    publisher?: string;
}

/** 媒体ごとの収集結果。取れなくなった媒体に気づけるよう保存する */
export interface NewsSourceReport {
    id: string;
    label: string;
    /** 媒体から受け取った件数 */
    fetched: number;
    /** 奈良・建築の絞り込みを通った件数 */
    kept: number;
    error?: string;
}

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
};

// どの媒体も奈良の建設関連に絞って取得しているので、全媒体を建設系として扱う
const CONSTRUCTION_NEWS_SOURCES = new Set(['constnews', 'shinpou', 'naranp', 'decn', 'kensetsu', 'xtech', 'googlenews']);
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

function parseRssDate(dateStr: string): string {
    try {
        const d = new Date(dateStr);
        // 収集はUTCのサーバーで動くので、日本時間に固定しないと早朝の記事が前日になる
        if (!isNaN(d.getTime())) return toJstDateKey(d);
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
    if (title.length < 6 || title.length > 200) return true;
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
        // 掲載順の番号をidにすると実行のたびに別の記事を指すので、URLから作る
        id: `news-${crypto.createHash('md5').update(link).digest('hex').slice(0, 12)}`,
        title,
        link,
        category,
        relevanceScore,
        results,
        orderer,
    };
}

/** 奈良の案件かどうかの判定に使う地名。他県にもある町名は市町村の接尾辞まで含める */
const NARA_PLACE_PATTERN = new RegExp([
    '奈良', '橿原市', '生駒市', '大和高田市', '大和郡山市', '葛城市', '五條市', '御所市', '天理市',
    '桜井市', '宇陀市', '香芝市', '田原本町', '広陵町', '川西町', '三宅町', '山添村', '平群町',
    '安堵町', '高取町', '斑鳩町', '三郷町', '王寺町', '大淀町', '吉野町', '下市町', '上牧町',
    '河合町', '明日香村', '十津川村', '野迫川村', '曽爾村', '御杖村', '東吉野村', '黒滝村',
    '天川村', '下北山村', '上北山村', '川上村',
].join('|'));

/** Googleニュースは観光記事が多いので、見出しに工事・計画の語があるものだけ残す */
const BUILDING_HEADLINE_PATTERN = /建設|新築|建替|建て替え|改修|改築|再整備|再開発|整備事業|着工|竣工|解体|耐震|長寿命化|基本計画|基本設計|実施設計|入札|落札|プロポーザル|工事/;
const NON_BUILDING_HEADLINE_PATTERN = /【入札結果】|レポート|宿泊記|旅行|観光|グルメ|展覧会|美術|重要文化財|解体修理|仏像|古墳|コンサート|EXPO|体験/;

export function isNaraRelated(text: string): boolean {
    return NARA_PLACE_PATTERN.test(text);
}

export function isNaraBuildingHeadline(title: string): boolean {
    return isNaraRelated(title)
        && BUILDING_HEADLINE_PATTERN.test(title)
        && !NON_BUILDING_HEADLINE_PATTERN.test(title);
}

export interface RawFeedItem {
    title: string;
    link: string;
    date: string;
    body: string;
    category?: string;
    /** Googleニュースの <source> に入る掲載元 */
    publisher?: string;
}

/** RSS 2.0 と RDF(RSS 1.0) の両方を読む */
export function parseFeedItems(xml: string, baseUrl: string): RawFeedItem[] {
    const $ = cheerio.load(xml, { xmlMode: true });
    const items: RawFeedItem[] = [];

    $('item').each((_, el) => {
        // content:encoded や dc:date のようなコロン付きタグはセレクタで扱えない
        const child = (name: string) => $(el).children()
            .filter((__, node) => (node as { tagName?: string }).tagName === name)
            .first();

        const link = normalizeLink(child('link').text().trim() || child('guid').text().trim(), baseUrl);
        const rawDate = child('pubDate').text().trim() || child('dc:date').text().trim();
        items.push({
            title: stripHtml(child('title').text()),
            link,
            date: parseRssDate(rawDate),
            body: stripHtml(child('content:encoded').text() || child('description').text()),
            category: stripHtml(child('category').text()) || undefined,
            publisher: stripHtml(child('source').text()) || undefined,
        });
    });

    return items;
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

type FeedSource = {
    id: string;
    label: string;
    urls: string[];
    /** 全国紙なので奈良の記事だけを残す */
    naraOnly?: boolean;
};

const FEED_SOURCES: FeedSource[] = [
    {
        // 奈良カテゴリのRSS。トップページから探す方式はブラウザが必要で、本番では0件だった
        id: 'constnews',
        label: '建設ニュース',
        urls: [
            'https://www.constnews.com/?cat=14&feed=rss2',
            'https://www.constnews.com/?cat=14&feed=rss2&paged=2',
        ],
    },
    {
        id: 'shinpou',
        label: '建設新報',
        urls: [
            'https://shinpou-nara.com/feed/',
            'https://shinpou-nara.com/feed/?paged=2',
            'https://shinpou-nara.com/feed/?paged=3',
        ],
    },
    {
        id: 'decn',
        label: '建設工業新聞',
        // 「奈良」のサイト内検索は無関係な全国記事しか返さないので、最新記事から選ぶ
        urls: [
            'https://www.decn.co.jp/feed/',
            'https://www.decn.co.jp/feed/?paged=2',
            'https://www.decn.co.jp/feed/?paged=3',
        ],
        naraOnly: true,
    },
    {
        id: 'kensetsu',
        label: '建設通信新聞',
        urls: [
            'https://www.kensetsunews.com/feed',
            'https://www.kensetsunews.com/feed?paged=2',
            'https://www.kensetsunews.com/feed?paged=3',
        ],
        naraOnly: true,
    },
    {
        id: 'xtech',
        label: '日経クロステック',
        urls: ['https://xtech.nikkei.com/rss/index.rdf'],
        naraOnly: true,
    },
];

async function fetchFeedSource(source: FeedSource): Promise<{ items: NewsItem[]; report: NewsSourceReport }> {
    const items: NewsItem[] = [];
    const errors: string[] = [];
    let fetched = 0;

    for (const [index, url] of source.urls.entries()) {
        if (index > 0) await delay(1500); // 同じサイトへ続けて取りに行くので間を空ける
        try {
            const feedItems = parseFeedItems(await fetchUrl(url), url);
            fetched += feedItems.length;
            for (const feedItem of feedItems) {
                // 全国紙は本文の奥で触れているだけの記事を除くため、冒頭だけを見る
                if (source.naraOnly && !isNaraRelated(`${feedItem.title} ${feedItem.body.slice(0, 200)}`)) continue;

                // 建設ニュースの見出しは「…／…／桜井市」のように末尾が発注者
                const titleOrderer = source.id === 'constnews' ? feedItem.title.split('／').pop()?.trim() : undefined;
                items.push({
                    id: '',
                    source: source.id,
                    sourceLabel: source.label,
                    title: feedItem.title,
                    date: feedItem.date,
                    link: feedItem.link,
                    excerpt: feedItem.body.slice(0, 140) || undefined,
                    orderer: source.id === 'shinpou' ? feedItem.category : titleOrderer,
                    results: extractResults(`${feedItem.title} ${feedItem.body}`),
                });
            }
        } catch (e) {
            errors.push(e instanceof Error ? e.message : String(e));
        }
    }

    return {
        items,
        report: { id: source.id, label: source.label, fetched, kept: items.length, error: errors[0] },
    };
}

/** 奈良新聞の「建設・開発」タグ。RSSが無いのでページから見出しとリンクだけを読む */
export function parseNaraNpTagPage(html: string): NewsItem[] {
    const $ = cheerio.load(html);
    const items: NewsItem[] = [];

    $('.cmp_article_list_row li.item a').each((_, anchor) => {
        const link = normalizeLink($(anchor).attr('href') || '', 'https://www.nara-np.co.jp/news/');
        const title = cleanTitle($(anchor).find('h3.title').first().text());
        if (!link || isNoiseTitle(title)) return;
        items.push({
            id: '',
            source: 'naranp',
            sourceLabel: '奈良新聞',
            title,
            date: parseFlexibleDate($(anchor).find('time.date').first().text()),
            link,
        });
    });

    return items;
}

async function fetchNaraNp(): Promise<{ items: NewsItem[]; report: NewsSourceReport }> {
    const base = { id: 'naranp', label: '奈良新聞' };
    try {
        const items = parseNaraNpTagPage(await fetchUrl('https://www.nara-np.co.jp/news/tag00071.html'));
        return { items, report: { ...base, fetched: items.length, kept: items.length } };
    } catch (e) {
        return { items: [], report: { ...base, fetched: 0, kept: 0, error: e instanceof Error ? e.message : String(e) } };
    }
}

const GOOGLE_NEWS_QUERIES = [
    '奈良 (建設 OR 新築 OR 建替 OR 改修 OR 再整備 OR 再開発 OR 着工 OR 竣工) when:14d',
    '奈良 (入札 OR 落札 OR 基本設計 OR 実施設計 OR 基本計画 OR プロポーザル) when:14d',
    '(橿原市 OR 生駒市 OR 大和郡山市 OR 香芝市 OR 天理市 OR 桜井市 OR 五條市 OR 葛城市 OR 宇陀市 OR 大和高田市 OR 御所市) (建設 OR 新築 OR 改修 OR 再整備 OR 着工 OR 入札) when:14d',
];

/** 直接読んでいる媒体はGoogleニュース経由では取らない(同じ記事が2件になる) */
const DIRECT_PUBLISHERS = /奈良新聞|建設新報|建設ニュース|建設工業新聞|建設通信新聞|日経クロステック/;

/** 朝日・毎日・読売・日経・NHKなど、個別に読めない媒体をまとめて拾う */
async function fetchGoogleNews(): Promise<{ items: NewsItem[]; report: NewsSourceReport }> {
    const items: NewsItem[] = [];
    const errors: string[] = [];
    let fetched = 0;

    for (const [index, query] of GOOGLE_NEWS_QUERIES.entries()) {
        if (index > 0) await delay(1500);
        try {
            const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ja&gl=JP&ceid=JP:ja`;
            const feedItems = parseFeedItems(await fetchUrl(url), url);
            fetched += feedItems.length;
            for (const feedItem of feedItems) {
                const title = cleanTitle(feedItem.title);
                if (!isNaraBuildingHeadline(title)) continue;
                if (feedItem.publisher && DIRECT_PUBLISHERS.test(feedItem.publisher)) continue;
                items.push({
                    id: '',
                    source: 'googlenews',
                    sourceLabel: '一般紙・Web',
                    publisher: feedItem.publisher,
                    title,
                    date: feedItem.date,
                    link: feedItem.link,
                });
            }
        } catch (e) {
            errors.push(e instanceof Error ? e.message : String(e));
        }
    }

    return {
        items,
        report: { id: 'googlenews', label: '一般紙・Web(Googleニュース)', fetched, kept: items.length, error: errors[0] },
    };
}

/** 全媒体を巡回する。1媒体の失敗で全体を止めない */
export async function collectNews(): Promise<{ items: NewsItem[]; sources: NewsSourceReport[] }> {
    const results = await Promise.all([
        ...FEED_SOURCES.map(fetchFeedSource),
        fetchNaraNp(),
        fetchGoogleNews(),
    ]);

    const items = results.flatMap(result => result.items)
        .map(enrichNewsItem)
        .filter((item): item is NewsItem => item !== null);

    return { items, sources: results.map(result => result.report) };
}

/** 記事の保存期間と上限。画面が毎回全件を読むので、増えすぎないようにする */
export const NEWS_RETENTION_DAYS = 180;
export const NEWS_MAX_ITEMS = 1500;

function normalizedHeadline(title: string): string {
    return title.normalize('NFKC').replace(/[\s・／/、。「」『』()（）【】]/g, '');
}

/**
 * 保存済みの記事に今回の分を足す。媒体のRSSは最新10件ほどしか返さないので、
 * 貯めていかないと過去の記事がすぐ読めなくなる。
 */
export function mergeNewsItems(existing: NewsItem[], incoming: NewsItem[], now: Date = new Date()): NewsItem[] {
    const byLink = new Map(existing.map(item => [item.link, item]));
    const today = toJstDateKey(now);
    for (const item of incoming) {
        const previous = byLink.get(item.link);
        // 日付が取れない記事は、最初に見つけた日を載せる(末尾に沈むと読まれない)
        byLink.set(item.link, { ...item, date: item.date || previous?.date || today });
    }

    const oldest = addDaysJstDateKey(-NEWS_RETENTION_DAYS, now);
    const sorted = Array.from(byLink.values())
        .filter(item => item.date >= oldest)
        // 同じ見出しが複数の媒体にあるときは、専門紙の記事を残す
        .sort((a, b) => Number(a.source === 'googlenews') - Number(b.source === 'googlenews'));

    const seenHeadlines = new Set<string>();
    return sorted
        .filter(item => {
            const key = normalizedHeadline(item.title);
            if (seenHeadlines.has(key)) return false;
            seenHeadlines.add(key);
            return true;
        })
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, NEWS_MAX_ITEMS);
}

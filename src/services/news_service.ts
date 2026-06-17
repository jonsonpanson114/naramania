import axios from 'axios';
import * as cheerio from 'cheerio';
import { fetchNewsViaBrowser } from './news_browser_service';

export interface NewsItem {
    id: string;
    source: string;
    sourceLabel: string;
    title: string;
    date: string;
    link: string;
    excerpt?: string;
}

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
};

async function fetchUrl(url: string): Promise<string> {
    const res = await axios.get(url, { headers: HEADERS, timeout: 10000, maxRedirects: 3 });
    return res.data;
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

function parseRssDate(dateStr: string): string {
    try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    } catch { }
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
    return /^(ホーム|トップ|一覧|検索|ログイン|購読|広告|お問い合わせ|会社案内|サイトマップ|プライバシー)/.test(title);
}

function cleanTitle(title: string): string {
    return stripHtml(title)
        .replace(/\s*\|\s*.*$/, '')
        .replace(/\s+-\s+.*$/, '')
        .trim();
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
            const description = stripHtml($(el).find('description').text()).slice(0, 100);
            if (isNoiseTitle(title) || !link) return;
            items.push({ id: `shinpou-${i}`, source: 'shinpou', sourceLabel: '新報奈良', title, date: parseRssDate(pubDate), link, excerpt: description || undefined });
        });
        console.log(`[News] 新報奈良: ${items.length}件`);
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

        $('a[href*="?p="]').each((i, el) => {
            if (items.length >= 10) return false;
            const title = cleanTitle($(el).text().trim());
            const href = normalizeLink($(el).attr('href') || '', 'https://www.decn.co.jp/');
            if (isNoiseTitle(title) || !href) return;

            // Date is usually nearby in the parent container
            const container = $(el).closest('div, li, article');
            const containerText = container.length ? container.text() : $(el).parent().text();
            const dateMatch = containerText.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
            const date = dateMatch
                ? `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`
                : '';

            items.push({ id: `decn-${items.length}`, source: 'decn', sourceLabel: '建設工業新聞', title, date, link: href });
        });
        console.log(`[News] 建設工業新聞: ${items.length}件`);
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
        $('a').each((i, el) => {
            if (items.length >= 15) return false;
            const href = $(el).attr('href') || '';
            if (!href.match(/\/(news|article|topics)\//i) && !href.match(/\/\d{5,}/)) return;

            const title = cleanTitle($(el).find('h3, h4, .title').text().trim() || $(el).text().trim());
            if (isNoiseTitle(title)) return;

            const dateText = $(el).find('[class*="date"], time').text().trim();
            const dateMatch = dateText.match(/(\d{4})[.\-/](\d{2})[.\-/](\d{2})/);
            const date = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : '';

            const fullHref = normalizeLink(href, 'https://www.nara-np.co.jp/');
            if (!fullHref) return;
            items.push({ id: `naranp-${items.length}`, source: 'naranp', sourceLabel: '奈良新聞', title, date, link: fullHref });
        });
        console.log(`[News] 奈良新聞(HTML): ${items.length}件`);
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
        const title = cleanTitle(item.title);
        const link = normalizeLink(item.link, item.link);
        if (isNoiseTitle(title) || !link) return;
        const key = link || `${item.source}:${title}`;
        if (!unique.has(key)) {
            unique.set(key, { ...item, title, link });
        }
    });

    const finalItems = Array.from(unique.values());
    // 日付降順
    finalItems.sort((a, b) => (b.date || '0000-00-00').localeCompare(a.date || '0000-00-00'));
    return finalItems;
}

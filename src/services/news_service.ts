import axios from 'axios';
import * as cheerio from 'cheerio';

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

function parseRssDate(dateStr: string): string {
    try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    } catch { }
    return new Date().toISOString().split('T')[0];
}

function stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
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
            const link = $(el).find('link').text().trim() || $(el).find('guid').text().trim();
            const pubDate = $(el).find('pubDate').text().trim();
            const description = stripHtml($(el).find('description').text()).slice(0, 100);
            if (!title || !link) return;
            items.push({ id: `shinpou-${i}`, source: 'shinpou', sourceLabel: '新報奈良', title, date: parseRssDate(pubDate), link, excerpt: description || undefined });
        });
        console.log(`[News] 新報奈良: ${items.length}件`);
        return items;
    } catch (e) {
        console.warn('[News] 新報奈良 エラー:', (e as Error).message);
        return [];
    }
}

// 建設ニュース (constnews.com) — WordPress RSS (奈良県タグ)
async function fetchConstNews(): Promise<NewsItem[]> {
    try {
        const xml = await fetchUrl('https://www.constnews.com/feed/?tag=%E5%A5%88%E8%89%AF%E7%9C%8C');
        const $ = cheerio.load(xml, { xmlMode: true });
        const items: NewsItem[] = [];
        $('item').each((i, el) => {
            if (i >= 10) return false;
            const title = stripHtml($(el).find('title').text().trim());
            const link = $(el).find('link').text().trim() || $(el).find('guid').text().trim();
            const pubDate = $(el).find('pubDate').text().trim();
            const description = stripHtml($(el).find('description').text()).slice(0, 100);
            if (!title || !link) return;
            items.push({ id: `constnews-${i}`, source: 'constnews', sourceLabel: '建設ニュース', title, date: parseRssDate(pubDate), link, excerpt: description || undefined });
        });
        console.log(`[News] 建設ニュース: ${items.length}件`);
        return items;
    } catch (e) {
        console.warn('[News] 建設ニュース エラー:', (e as Error).message);
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
            const title = $(el).text().trim();
            const href = $(el).attr('href') || '';
            if (!title || title.length < 5) return;

            // Date is usually nearby in the parent container
            const container = $(el).closest('div, li, article');
            const containerText = container.length ? container.text() : $(el).parent().text();
            const dateMatch = containerText.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
            const date = dateMatch
                ? `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`
                : new Date().toISOString().split('T')[0];

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
            const link = $(el).find('link').text().trim() || $(el).find('guid').text().trim();
            const pubDate = $(el).find('pubDate').text().trim();
            const description = stripHtml($(el).find('description').text()).slice(0, 100);
            if (!title || !link) return;
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

            const title = $(el).find('h3, h4, .title').text().trim() || $(el).text().trim();
            if (!title || title.length < 5) return;

            const dateText = $(el).find('[class*="date"], time').text().trim();
            const dateMatch = dateText.match(/(\d{4})[.\-/](\d{2})[.\-/](\d{2})/);
            const date = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : new Date().toISOString().split('T')[0];

            const fullHref = href.startsWith('http') ? href : `https://www.nara-np.co.jp${href}`;
            items.push({ id: `naranp-${items.length}`, source: 'naranp', sourceLabel: '奈良新聞', title, date, link: fullHref });
        });
        console.log(`[News] 奈良新聞(HTML): ${items.length}件`);
        return items;
    } catch (e) {
        console.warn('[News] 奈良新聞 エラー:', (e as Error).message);
        return [];
    }
}

// 建通新聞デジタル (digital.kentsu.co.jp) — React SPA、RSS試行のみ
async function fetchKentsu(): Promise<NewsItem[]> {
    try {
        const xml = await fetchUrl('https://digital.kentsu.co.jp/feed/');
        const $ = cheerio.load(xml, { xmlMode: true });
        const items: NewsItem[] = [];
        $('item').each((i, el) => {
            if (i >= 10) return false;
            const title = stripHtml($(el).find('title').text().trim());
            const link = $(el).find('link').text().trim() || $(el).find('guid').text().trim();
            const pubDate = $(el).find('pubDate').text().trim();
            if (!title || !link) return;
            // Filter: 奈良関連のみ
            if (!title.includes('奈良') && !link.includes('nara')) return;
            items.push({ id: `kentsu-${i}`, source: 'kentsu', sourceLabel: '建通新聞', title, date: parseRssDate(pubDate), link });
        });
        console.log(`[News] 建通新聞: ${items.length}件`);
        return items;
    } catch (e) {
        console.warn('[News] 建通新聞 エラー:', (e as Error).message);
        return [];
    }
}

export async function fetchAllNews(): Promise<NewsItem[]> {
    const results = await Promise.allSettled([
        fetchShinpouNara(),
        fetchConstNews(),
        fetchDecn(),
        fetchNaraNp(),
        fetchKentsu(),
    ]);

    const allItems: NewsItem[] = [];
    for (const result of results) {
        if (result.status === 'fulfilled') allItems.push(...result.value);
    }

    // 日付降順
    allItems.sort((a, b) => b.date.localeCompare(a.date));
    return allItems;
}

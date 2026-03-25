import { chromium } from 'playwright';
import { NewsItem } from './news_service';

/**
 * 403エラーやブロックが発生しやすいニュースサイトを Playwright で強行突破する
 */
export async function fetchNewsViaBrowser(): Promise<NewsItem[]> {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    const items: NewsItem[] = [];

    try {
        // 1. 建設ニュース (constnews.com)
        console.log('[News] 建設ニュース (Browser) 開始...');
        // 検索ページではなく、最新ニュース一覧から「奈良」を探す作戦
        await page.goto('https://www.constnews.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);
        
        const constNewsItems = await page.evaluate(() => {
            const list: Array<{ id: string; source: string; sourceLabel: string; title: string; date: string; link: string }> = [];
            document.querySelectorAll('a').forEach((el, i) => {
                const text = el.textContent?.trim() || '';
                const href = (el as HTMLAnchorElement).href;
                if (list.length < 10 && (text.includes('奈良') || href.includes('nara'))) {
                    list.push({
                        id: `constnews-browser-${i}-${Math.random().toString(36).slice(2, 5)}`,
                        source: 'constnews',
                        sourceLabel: '建設ニュース',
                        title: text,
                        date: new Date().toISOString().split('T')[0],
                        link: href
                    });
                }
            });
            return list;
        });
        items.push(...constNewsItems);
        console.log(`[News] 建設ニュース (Browser): ${constNewsItems.length}件`);

        // 2. 建通新聞 (kentsu.co.jp)
        console.log('[News] 建通新聞 (Browser) 開始...');
        // 検索ではなくエリアトップを狙う
        await page.goto('https://www.kentsu.co.jp/area/nara.asp', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(5000);
        
        const kentsuItems = await page.evaluate(() => {
            const list: Array<{ id: string; source: string; sourceLabel: string; title: string; date: string; link: string }> = [];
            // エリアニュースの一覧を捕捉
            document.querySelectorAll('.newslist li, .list_news a, a[href*="/news/"]').forEach((el, i) => {
                if (list.length >= 10) return;
                const text = el.textContent?.trim() || '';
                const href = (el as HTMLAnchorElement).href;
                if (text.length > 10 && (href.includes('/news/') || href.includes('nara'))) {
                    const row = el.closest('li, tr, div');
                    const dateMatch = row?.textContent?.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/) || 
                                      row?.textContent?.match(/(\d{1,2})[\/\-](\d{1,2})/);
                    let date = new Date().toISOString().split('T')[0];
                    if (dateMatch) {
                        if (dateMatch[3]) date = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
                        else date = `${new Date().getFullYear()}-${dateMatch[1].padStart(2, '0')}-${dateMatch[2].padStart(2, '0')}`;
                    }
                    list.push({
                        id: `kentsu-browser-${i}-${Math.random().toString(36).slice(2, 5)}`,
                        source: 'kentsu',
                        sourceLabel: '建通新聞',
                        title: text,
                        date,
                        link: href
                    });
                }
            });
            return list;
        });
        items.push(...kentsuItems);
        console.log(`[News] 建通新聞 (Browser): ${kentsuItems.length}件`);

    } catch (e: unknown) {
        console.error('[News] Browser Fetch エラー:', e instanceof Error ? e.message : String(e));
    } finally {
        await browser.close();
    }

    return items;
}

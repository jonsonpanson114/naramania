import { chromium } from 'playwright';
import type { NewsItem } from './news_service';

export async function fetchNewsViaBrowser(): Promise<NewsItem[]> {
    const items: NewsItem[] = [];

    const browser = await chromium.launch({ headless: true });
    try {
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        page.setDefaultNavigationTimeout(15000);

        // 建設ニュース (constnews.com)
        // 検索ページではなく、最新ニュース一覧から「奈良」を探す作戦
        console.log('[News] 建設ニュース (Browser) 開始...');
        await page.goto('https://www.constnews.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1000);

        const constNewsItems = await page.evaluate(() => {
            const list: Array<{ id: string; source: string; sourceLabel: string; title: string; date: string; link: string; excerpt?: string }> = [];

            // 記事カードは article.postBox。サイドバーの人気ランキング(li.rankingItem)は
            // 日付を持たず「N views per day」が付くだけなので拾わない。
            // ※ page.evaluate 内でヘルパー関数を定義するとバンドラが __name を注入し
            //   ブラウザ側で ReferenceError になるため、テキスト整形は都度インラインで書く。
            document.querySelectorAll('article.postBox').forEach((box, i) => {
                if (list.length >= 10) return;

                const anchor = box.querySelector('a.postBox__inner') as HTMLAnchorElement | null;
                const href = anchor?.href || '';
                const title = (box.querySelector('.postBox__title')?.textContent || '').replace(/\s+/g, ' ').trim();
                const category = (box.querySelector('.postBox__cat')?.textContent || '').replace(/\s+/g, ' ').trim();
                const body = (box.querySelector('.postBox__text')?.textContent || '').replace(/\s+/g, ' ').trim();
                if (!href.startsWith('http') || title.length < 8) return;

                // カテゴリは「入札結果 ／ 奈良」のように地域を含む
                if (!/奈良/.test(`${category} ${title} ${body}`)) return;

                // 「2026.08.10」形式
                const rawDate = (box.querySelector('.postBox__date')?.textContent || '').replace(/\s+/g, ' ').trim();
                const m = rawDate.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
                const date = m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';

                list.push({
                    id: `constnews-browser-${i}`,
                    source: 'constnews',
                    sourceLabel: '建設ニュース',
                    title: category ? `${category.replace(/\s*／\s*/, '／')} ${title}` : title,
                    date,
                    link: href,
                    excerpt: body || undefined,
                });
            });
            return list;
        });
        items.push(...constNewsItems);
        console.log(`[News] 建設ニュース (Browser): ${constNewsItems.length}件（日付あり ${constNewsItems.filter(i => i.date).length}件）`);

        // 建通新聞(kentsu.co.jp)は奈良エリアページが廃止され、トップへリダイレクトされる
        // ようになったため取得対象から外している（2026-08 時点で奈良関連の導線なし）。

    } catch (e: unknown) {
        console.error('[News] Browser Fetch エラー:', e instanceof Error ? e.message : String(e));
    } finally {
        await browser.close();
    }

    return items;
}

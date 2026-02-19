
import { chromium } from 'playwright';

async function extractAbsoluteLinks() {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.goto('https://h2o.nara.nara.jp/', { waitUntil: 'domcontentloaded' });

    const newsLink = await page.getByRole('link', { name: /事後審査型一般競争入札/ }).first().getAttribute('href');

    if (newsLink) {
        const fullUrl = newsLink.startsWith('http') ? newsLink : `https://h2o.nara.nara.jp${newsLink}`;
        console.log(`Navigating to detail: ${fullUrl}`);
        await page.goto(fullUrl, { waitUntil: 'domcontentloaded' });

        const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a'))
                .map(a => (a as HTMLAnchorElement).href);
        });
        console.log('All links on page:', JSON.stringify(links, null, 2));
    } else {
        console.log('Detail link not found.');
    }

    await browser.close();
}

extractAbsoluteLinks();

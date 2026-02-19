
import { chromium } from 'playwright';

async function findPdfs() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto('https://www.city.nara.lg.jp/site/nyusatu-keiyaku/list339-847.html', { waitUntil: 'domcontentloaded' });

    const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a'))
            .map(a => a.href)
            .filter(href => href.endsWith('.pdf'));
    });

    console.log(JSON.stringify(links, null, 2));
    await browser.close();
}

findPdfs();

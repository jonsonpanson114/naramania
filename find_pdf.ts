
import { chromium } from 'playwright';

async function findPdf() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
        console.log('Navigating to Nara City Bidding Results...');
        await page.goto('https://www.city.nara.lg.jp/site/nyusatu-keiyaku/list339-1051.html', { waitUntil: 'domcontentloaded' });

        const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a'))
                .map(a => ({ text: a.innerText, href: (a as HTMLAnchorElement).href }))
                .filter(l => l.href.endsWith('.pdf'));
        });

        console.log('Found PDF Links:');
        console.log(JSON.stringify(links, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
}

findPdf();

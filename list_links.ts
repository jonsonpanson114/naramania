
import { chromium } from 'playwright';

async function listLinks() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
        console.log('Navigating to Nara City Bidding Portal...');
        await page.goto('https://www.city.nara.lg.jp/site/nyusatu-keiyaku/', { waitUntil: 'domcontentloaded' });

        const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a'))
                .map(a => ({ text: a.innerText, href: (a as HTMLAnchorElement).href }))
                .filter(l => l.text.includes('結果') || l.text.includes('開札'));
        });

        console.log('Relevant Links:');
        console.log(JSON.stringify(links, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
}

listLinks();


import { chromium } from 'playwright';

async function scavenger() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
        console.log('--- Scraping Nara City Results Links ---');
        await page.goto('https://www.city.nara.lg.jp/site/nyusatu-keiyaku/list342-1051.html', { waitUntil: 'domcontentloaded' });

        const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a'))
                .map(a => ({ text: a.innerText.trim(), href: (a as HTMLAnchorElement).href }))
                .filter(l => l.href.endsWith('.pdf'));
        });

        console.log('FOUND_LINKS:');
        console.log(JSON.stringify(links, null, 2));
    } catch (e: any) {
        console.error('Error:', e.message);
    } finally {
        await browser.close();
    }
}

scavenger();

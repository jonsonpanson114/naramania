
import { chromium } from 'playwright';

async function scavenger() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
        console.log('--- Scraping Nara Prefecture Portal ---');
        await page.goto('https://www.pref.nara.jp/10553.htm', { waitUntil: 'domcontentloaded' });

        const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a'))
                .map(a => ({ text: a.innerText.trim(), href: (a as HTMLAnchorElement).href }));
        });

        console.log('LINKS:');
        console.log(JSON.stringify(links, null, 2));
    } catch (e: any) {
        console.error('Error:', e.message);
    } finally {
        await browser.close();
    }
}

scavenger();

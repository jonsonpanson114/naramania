
import { chromium } from 'playwright';

async function scavenger() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
        console.log('--- Scraping Nara City Contract Dept Results ---');
        await page.goto('https://www.city.nara.lg.jp/soshiki/71/1811.html', { waitUntil: 'domcontentloaded' });

        const pdfLinks = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a'))
                .map(a => ({ text: a.innerText.trim(), href: (a as HTMLAnchorElement).href }))
                .filter(l => l.href.endsWith('.pdf'));
        });

        console.log('PDF_LINKS:');
        console.log(JSON.stringify(pdfLinks, null, 2));

        // Let's also look for links that lead to sub-pages with more PDFs
        const subLinks = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a'))
                .map(a => ({ text: a.innerText.trim(), href: (a as HTMLAnchorElement).href }))
                .filter(l => l.text.includes('結果') && !l.href.endsWith('.pdf'));
        });
        console.log('SUB_LINKS:');
        console.log(JSON.stringify(subLinks, null, 2));

    } catch (e: any) {
        console.error('Error:', e.message);
    } finally {
        await browser.close();
    }
}

scavenger();


import { chromium } from 'playwright';

async function findEnterprisePdfs() {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    // Enterprise Bureau bidding page
    const url = 'https://h2o.nara.nara.jp/soshiki/1/nyu-ippan-koukoku.html';
    console.log(`Navigating to Enterprise Bureau: ${url}`);

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        const pdfLinks = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a'))
                .map(a => (a as HTMLAnchorElement).href)
                .filter(href => href.endsWith('.pdf'));
        });

        console.log('Found PDF Links:', JSON.stringify(pdfLinks, null, 2));
    } catch (e) {
        console.error('Navigation failed:', e);
    }

    await browser.close();
}

findEnterprisePdfs();

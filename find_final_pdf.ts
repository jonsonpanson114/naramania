
import { chromium } from 'playwright';

async function findFinalPdf() {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    console.log('Navigating to Enterprise Bureau Home...');
    await page.goto('https://h2o.nara.nara.jp/', { waitUntil: 'domcontentloaded' });

    // Click the specific news link found in screenshot
    console.log('Clicking recent news link...');
    const newsLink = page.getByRole('link', { name: /事後審査型一般競争入札/ }).first();

    if (await newsLink.count() > 0) {
        await newsLink.click();
        await page.waitForLoadState('domcontentloaded');

        console.log('On announcement page. Looking for PDF links...');
        const pdfLinks = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a'))
                .map(a => (a as HTMLAnchorElement).href)
                .filter(href => href.endsWith('.pdf'));
        });

        console.log('Final Resulting PDFs:', JSON.stringify(pdfLinks, null, 2));
    } else {
        console.log('News link not found via text match.');
    }

    await browser.close();
}

findFinalPdf();

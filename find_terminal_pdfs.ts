
import { chromium } from 'playwright';

async function findTerminalPdfs() {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    console.log('Navigating to Nara City Bidding Category...');
    await page.goto('https://www.city.nara.lg.jp/site/nyusatu-keiyaku/list339-847.html', { waitUntil: 'domcontentloaded' });

    // Click the first specific category link (e.g. 建設工事)
    const categoryLink = await page.getAttribute('a:has-text("建設工事の制限付一般競争入札公告")', 'href');
    if (categoryLink) {
        const fullUrl = categoryLink.startsWith('http') ? categoryLink : `https://www.city.nara.lg.jp${categoryLink}`;
        console.log(`Heading to: ${fullUrl}`);
        await page.goto(fullUrl, { waitUntil: 'domcontentloaded' });

        const pdfLinks = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a'))
                .map(a => a.href)
                .filter(href => href.endsWith('.pdf'));
        });

        console.log('Found PDF Links:', JSON.stringify(pdfLinks, null, 2));
    } else {
        console.log('Category link not found.');
    }

    await browser.close();
}

findTerminalPdfs();

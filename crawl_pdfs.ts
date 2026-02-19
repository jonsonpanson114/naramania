
import { chromium } from 'playwright';

async function crawlForPdfs() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const startUrl = 'https://www.city.nara.lg.jp/site/nyusatu-keiyaku/list339-847.html';

    console.log(`Starting crawl at: ${startUrl}`);
    await page.goto(startUrl, { waitUntil: 'domcontentloaded' });

    // Get all category links
    const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.list_title a'))
            .map(a => (a as HTMLAnchorElement).href);
    });

    console.log(`Found ${links.length} category links.`);

    const allPdfs: string[] = [];

    for (const link of links.slice(0, 3)) { // Check first 3 categories
        console.log(`Checking category: ${link}`);
        await page.goto(link, { waitUntil: 'domcontentloaded' });
        const pdfs = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a'))
                .map(a => (a as HTMLAnchorElement).href)
                .filter(href => href.endsWith('.pdf'));
        });
        allPdfs.push(...pdfs);
        if (allPdfs.length > 0) break;
    }

    console.log('Resulting PDFs:', JSON.stringify(allPdfs, null, 2));
    await browser.close();
}

crawlForPdfs();

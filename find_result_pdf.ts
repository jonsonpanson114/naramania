
import { chromium } from 'playwright';

async function findResultPdf() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
        console.log('Navigating to Nara City Bidding Results Category...');
        await page.goto('https://www.city.nara.lg.jp/site/nyusatu-keiyaku/list342-3859.html', { waitUntil: 'domcontentloaded' });

        // Find links that might be a list of results
        const subLinks = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a'))
                .map(a => ({ text: a.innerText, href: (a as HTMLAnchorElement).href }))
                .filter(l => l.text.includes('結果') || l.text.includes('令和6年度'));
        });

        console.log('Possible Result List Links:');
        console.log(JSON.stringify(subLinks, null, 2));

        // If there's a specific one like "令和6年度 建設工事", we'll go there
        const target = subLinks.find(l => l.text.includes('建設工事') && l.text.includes('年度'));
        if (target) {
            console.log(`Going deeper into: ${target.text} (${target.href})`);
            await page.goto(target.href, { waitUntil: 'domcontentloaded' });

            const pdfs = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('a'))
                    .map(a => ({ text: a.innerText, href: (a as HTMLAnchorElement).href }))
                    .filter(l => l.href.endsWith('.pdf'));
            });
            console.log('PDFs found on target page:');
            console.log(JSON.stringify(pdfs, null, 2));
        }
    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
}

findResultPdf();

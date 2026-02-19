
import { chromium } from 'playwright';

async function getUrl() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
        await page.goto('https://www.city.nara.lg.jp/site/nyusatu-keiyaku/list339-1051.html', { waitUntil: 'domcontentloaded' });
        const pdfUrl = await page.evaluate(() => {
            const pdf = Array.from(document.querySelectorAll('a'))
                .find(a => a.href.endsWith('.pdf'));
            return pdf ? (pdf as HTMLAnchorElement).href : null;
        });
        if (pdfUrl) {
            console.log(pdfUrl);
        }
    } catch (e) { } finally {
        await browser.close();
    }
}

getUrl();

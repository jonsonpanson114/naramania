
import { chromium } from 'playwright';

async function getFirstPdf() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
        console.log('Navigating to Nara City Construction Results...');
        await page.goto('https://www.city.nara.lg.jp/site/nyusatu-keiyaku/list339-1051.html', { waitUntil: 'domcontentloaded' });

        const pdfUrl = await page.evaluate(() => {
            const pdf = Array.from(document.querySelectorAll('a'))
                .find(a => a.href.endsWith('.pdf'));
            return pdf ? (pdf as HTMLAnchorElement).href : null;
        });

        if (pdfUrl) {
            console.log(`REAL_PDF_URL: ${pdfUrl}`);
        } else {
            console.log('No PDF found on this page.');
        }
    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
}

getFirstPdf();

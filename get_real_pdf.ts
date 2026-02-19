
import { chromium } from 'playwright';

async function getRealPdf() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
        // Nara City Enterprise Bureau Results Page
        const targetUrl = 'https://www.city.nara.lg.jp/site/kigyou/2157.html';
        console.log(`Navigating to ${targetUrl}...`);
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const pdfUrl = await page.evaluate(() => {
            const anchors = Array.from(document.querySelectorAll('a'));
            // Look for links ending in .pdf and preferably containing "結果" or "落札"
            const pdf = anchors.find(a => a.href.endsWith('.pdf'));
            return pdf ? pdf.href : null;
        });

        if (pdfUrl) {
            console.log(`PDF_FOUND: ${pdfUrl}`);
        } else {
            console.log('NO_PDF_FOUND');
        }
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await browser.close();
    }
}

getRealPdf();


import { chromium } from 'playwright';

async function getEnterprisePdf() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
        console.log('Navigating to Nara City Enterprise Bureau Results...');
        await page.goto('https://h2o.nara.nara.jp/list/list_k3.html', { waitUntil: 'domcontentloaded' });

        const pdfUrl = await page.evaluate(() => {
            const pdf = Array.from(document.querySelectorAll('a'))
                .find(a => a.href.endsWith('.pdf') && a.innerText.includes('開札結果'));
            return pdf ? (pdf as HTMLAnchorElement).href : null;
        });

        if (pdfUrl) {
            console.log(`REAL_PDF_URL: ${pdfUrl}`);
        } else {
            // Try any PDF
            const anyPdf = await page.evaluate(() => {
                const a = Array.from(document.querySelectorAll('a')).find(a => a.href.endsWith('.pdf'));
                return a ? (a as HTMLAnchorElement).href : null;
            });
            console.log(`ANY_PDF_URL: ${anyPdf}`);
        }
    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
}

getEnterprisePdf();

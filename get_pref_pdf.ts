
import { chromium } from 'playwright';
import fs from 'fs';

async function getPrefPdf() {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        console.log('--- Accessing Nara Pref Portal ---');
        await page.goto('https://www.pref.nara.jp/10553.htm', { timeout: 60000, waitUntil: 'domcontentloaded' });

        // Find PPI link
        const ppiLink = await page.evaluate(() => {
            const anchors = Array.from(document.querySelectorAll('a'));
            const target = anchors.find(a => a.href.includes('TopStart.do') || a.innerText.includes('入札情報公開システム'));
            return target ? target.href : null;
        });

        if (!ppiLink) {
            console.error('PPI Link not found on portal');
            return;
        }

        console.log(`Navigating to PPI: ${ppiLink}`);
        await page.goto(ppiLink, { waitUntil: 'load', timeout: 60000 }); // Wait for load
        await page.waitForTimeout(5000);

        // Handle frames explicitly
        // Sometimes frame names are different.
        const frames = page.frames();
        console.log('Frames found:', frames.map(f => f.name()));

        const menuFrame = frames.find(f => f.url().includes('Menu') || f.name().toLowerCase().includes('menu'));
        if (!menuFrame) {
            console.error('Menu frame not found');
            return;
        }

        console.log('Clicking "入札結果" (Results)...');
        // Click results button (P5520)
        try {
            await menuFrame.click('#P5520', { timeout: 10000 });
        } catch {
            await menuFrame.getByText('入札結果').first().click({ timeout: 10000 });
        }
        await page.waitForTimeout(5000);

        const mainFrame = page.frames().find(f => f.url().includes('Main') || f.name().toLowerCase().includes('main'));
        if (!mainFrame) {
            console.error('Main frame not found');
            return;
        }

        console.log('Searching for results...');
        await mainFrame.click('#btnSearch', { timeout: 15000 });
        await page.waitForTimeout(5000);

        // Find detail button
        const buttons = await mainFrame.getByRole('button', { name: '詳細' }).all();
        console.log(`Found ${buttons.length} results.`);

        if (buttons.length > 0) {
            console.log('Clicking first detail button...');
            await buttons[0].click();
            await page.waitForTimeout(8000); // Wait for detail load

            // In detail page, find PDF
            const pdfUrl = await mainFrame.evaluate(() => {
                const anchors = Array.from(document.querySelectorAll('a'));
                const pdf = anchors.find(a => a.href.endsWith('.pdf'));
                return pdf ? pdf.href : null;
            });

            if (pdfUrl) {
                console.log(`REAL_PDF_URL: ${pdfUrl}`);
                fs.writeFileSync('found_pdf.txt', pdfUrl);
            } else {
                console.log('No PDF link found in detail page.');
                const text = await mainFrame.innerText('body');
                fs.writeFileSync('debug_detail.txt', text);
            }
        } else {
            console.log('No results found.');
            const text = await mainFrame.innerText('body');
            fs.writeFileSync('debug_search.txt', text);
        }

    } catch (e: any) {
        console.error('Error:', e);
    } finally {
        await browser.close();
    }
}

getPrefPdf();

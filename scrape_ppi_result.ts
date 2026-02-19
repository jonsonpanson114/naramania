
import { chromium } from 'playwright';
import fs from 'fs';

async function scrapePpi() {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        console.log('--- Accessing Nara City PPI (Corrected) ---');
        // Nara City PPI URL
        await page.goto('https://nara.efftis.jp/PPI/Public/PPUBC00100?kikanno=0201', { waitUntil: 'domcontentloaded', timeout: 60000 });

        console.log('Page loaded. Expanding "Construction" menu...');
        // Click "建設工事" to expand menu (text match)
        await page.getByText('建設工事').first().click();
        await page.waitForTimeout(1000);

        console.log('Clicking "入札・契約結果" (Results)...');
        // Click the submenu item. It might be hidden if expansion failed, but Playwright might force click or we wait.
        // Selector based on the HTML: .submenu.PPUBC0070000 or text
        await page.locator('.submenu.PPUBC0070000').click();

        console.log('Waiting for search page...');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(3000);

        // Now on search page (PPUBC00700?)
        // Need to click Search button.
        // Let's assume there is a 'search' button. I'll dump html if fail.
        console.log('Clicking Search...');
        // Try generic search button selector or ID if known from typical PPI
        // Usually #btnSearch or input[type=button] check text
        const searchBtn = page.locator('#btnSearch').or(page.getByRole('button', { name: '検索' })).or(page.getByDisplayValue('検索'));

        if (await searchBtn.count() > 0) {
            await searchBtn.first().click();
        } else {
            console.log('Search button not found, dumping page...');
            fs.writeFileSync('debug_search_page.html', await page.content());
            return;
        }

        await page.waitForTimeout(5000);

        console.log('Looking for "詳細" (Details) buttons...');
        const buttons = await page.getByRole('button', { name: '詳細' }).all();
        console.log(`Found ${buttons.length} detail buttons.`);

        if (buttons.length > 0) {
            console.log('Clicking first detail button...');
            await buttons[0].click();
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(5000);

            // In detail page, find PDF
            console.log('Looking for PDF links...');
            const pdfUrl = await page.evaluate(() => {
                const anchors = Array.from(document.querySelectorAll('a'));
                const pdf = anchors.find(a => a.href.endsWith('.pdf'));
                return pdf ? pdf.href : null;
            });

            if (pdfUrl) {
                console.log(`REAL_PDF_URL: ${pdfUrl}`);
                fs.writeFileSync('found_pdf.txt', pdfUrl);
            } else {
                console.log('No PDF link found in detail page.');
                fs.writeFileSync('debug_detail_page.html', await page.content());
            }
        } else {
            console.log('No results found.');
            fs.writeFileSync('debug_search_results.html', await page.content());
        }

    } catch (e: any) {
        console.error('Error:', e);
        if (e.message.includes('target closed')) return;
    } finally {
        await browser.close();
    }
}

scrapePpi();

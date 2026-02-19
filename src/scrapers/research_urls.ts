
import { chromium } from 'playwright';

async function research() {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    console.log('--- Checking Nara Pref Homepage ---');
    try {
        const response = await page.goto('https://www.pref.nara.jp/', { timeout: 30000 });
        console.log(`Status: ${response?.status()}`);
        console.log(`Title: ${await page.title()}`);

        // Search for "入札" link
        // Select elements that might be links to Bidding
        const textLinks = await page.getByRole('link', { name: /入札|発注/ }).all();
        console.log(`Found ${textLinks.length} links with '入札' or '発注'`);
        for (const link of textLinks) {
            console.log(`- ${await link.textContent()} -> ${await link.getAttribute('href')}`);
        }

    } catch (e) {
        console.log('Error accessing homepage:', e.message);
    }

    await browser.close();
}

research();

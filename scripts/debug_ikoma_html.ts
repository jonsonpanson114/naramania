
import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const url = 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680';
    
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(5000);
    
    console.log('Clicking 工事...');
    await page.locator('span:has-text("工事")').first().click({ force: true });
    await page.waitForTimeout(10000);
    
    const frames = page.frames();
    for (const f of frames) {
        console.log(`\n--- Frame: ${f.name()} ---`);
        const html = await f.evaluate(() => document.body.innerHTML).catch(() => '');
        // Search for "発注" in HTML
        if (html.includes('発注')) {
            console.log(`FOUND '発注' in frame ${f.name()}`);
            // Log snippet around "発注"
            const idx = html.indexOf('発注');
            console.log('Snippet:', html.slice(Math.max(0, idx - 50), idx + 200));
        }
    }
    
    await browser.close();
})();

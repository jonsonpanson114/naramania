
import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const url = 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680';
    
    console.log('Navigating to portal...');
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);
    
    console.log('Clicking 工事...');
    const span = page.locator('span:has-text("工事")').first();
    await span.click({ force: true });
    
    console.log('Waiting for frames to load...');
    await page.waitForTimeout(15000);
    
    console.log('Taking screenshot...');
    await page.screenshot({ path: 'ikoma_last_check.png', fullPage: true });
    
    console.log('Logging frames and text contents...');
    const frames = page.frames();
    for (const f of frames) {
        const text = await f.evaluate(() => document.body.innerText).catch(() => '');
        console.log(`[Frame: ${f.name()}] Text length: ${text.length}`);
        if (text.includes('検索')) {
            console.log(`[Frame: ${f.name()}] CONTAINS 検索`);
        }
    }
    
    await browser.close();
    console.log('Done.');
})();

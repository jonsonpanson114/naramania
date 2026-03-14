
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
    
    console.log('Listing all links in all frames:');
    const frames = page.frames();
    for (const f of frames) {
        console.log(`\n--- Frame: ${f.name()} ---`);
        const links = await f.evaluate(() => {
            return Array.from(document.querySelectorAll('a')).map(a => ({
                text: a.textContent?.trim(),
                href: a.href,
                id: a.id,
                outer: a.outerHTML.slice(0, 100)
            }));
        }).catch(() => []);
        
        links.forEach(l => {
            if (l.text && l.text.includes('検索')) {
                console.log(`[LINK] Text: "${l.text}" | Href: ${l.href}`);
            }
        });
    }
    
    await browser.close();
})();

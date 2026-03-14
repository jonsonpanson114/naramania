
import { chromium } from 'playwright';
import fs from 'fs';

async function testIkomaV7() {
    const logFile = 'debug_log_v7.txt';
    const log = (msg: string) => { console.log(msg); fs.appendFileSync(logFile, msg + '\n'); };
    fs.writeFileSync(logFile, '--- V7 Debug Start ---\n');
    
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto('https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680', { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);

        log('1. Clicking SPAN:工事');
        await page.locator('span:has-text("工事")').first().click();
        await page.waitForTimeout(5000);

        // Targeted navigation for epi-cloud's "Announcement" search
        log('2. Attempting to click menu link for Announcement (公告)');
        const menuFrame = page.frames().find(f => f.url().includes('koukai_menu'));
        if (menuFrame) {
            log('3. Found koukai_menu frame. Searching for "公告" link...');
            const links = await menuFrame.evaluate(() => {
                return Array.from(document.querySelectorAll('a')).map(a => ({ text: a.textContent?.trim(), href: a.href }));
            });
            log(`   Links in menu: ${JSON.stringify(links)}`);
            
            // Try to find "入札公告" or "発注の見通し"
            const announcementLink = menuFrame.locator('a:has-text("公告"), a:has-text("発注")').first();
            if (await announcementLink.count() > 0) {
                log('4. Clicking Announcement link in menu');
                await announcementLink.click();
                await page.waitForTimeout(5000);
                
                const mainFrame = page.frames().find(f => f.url().includes('koukai_main'));
                if (mainFrame) {
                    log(`5. In koukai_main [${mainFrame.url()}]. Checking for buttons...`);
                    const btns = await mainFrame.evaluate(() => {
                        return Array.from(document.querySelectorAll('input, button')).map(el => ({ val: (el as any).value, tag: el.tagName }));
                    });
                    log(`   Buttons in main: ${JSON.stringify(btns)}`);
                    
                    const searchBtn = mainFrame.locator('input[value*="検索"], button:has-text("検索")').first();
                    if (await searchBtn.count() > 0) {
                        log('6. Clicking Search button');
                        await searchBtn.click();
                        await page.waitForTimeout(5000);
                        log(`7. Rows: ${await mainFrame.locator('table tr').count()}`);
                    }
                }
            }
        }

    } catch (e: any) {
        log(`❌ Error: ${e.message}`);
    } finally {
        await browser.close();
    }
}
testIkomaV7();

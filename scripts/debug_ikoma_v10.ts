
import { chromium } from 'playwright';
import fs from 'fs';

async function testIkomaV10() {
    const logFile = 'debug_log_v10.txt';
    const log = (msg: string) => { console.log(msg); fs.appendFileSync(logFile, msg + '\n'); };
    fs.writeFileSync(logFile, '--- V10 Debug Start ---\n');
    
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto('https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680', { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);

        log('1. Page loaded. Clicking SPAN:工事...');
        await page.locator('span:has-text("工事")').first().click();
        await page.waitForTimeout(5000);

        const mainFrame = page.frames().find(f => f.url().includes('koukai_main'));
        if (mainFrame) {
            log('2. Found koukai_main. Waiting for frame network idle...');
            // In some epi-cloud versions, you have to click a "Search" submenu first
            const menuFrame = page.frames().find(f => f.url().includes('koukai_menu'));
            if (menuFrame) {
                log('3. Searching for ANY link in koukai_menu using recursive text search...');
                const menuBody = await menuFrame.evaluate(() => document.body.innerHTML);
                log(`   Menu Body Length: ${menuBody.length}`);
                
                // Try clicking EVERYTHING that looks like a link in menu
                const menuLinks = await menuFrame.locator('a, td, div').all();
                for (const link of menuLinks) {
                    const text = await link.innerText();
                    if (text.includes('公告') || text.includes('予定') || text.includes('結果')) {
                        log(`   🎯 Clicking menu item: ${text.trim()}`);
                        await link.click();
                        await page.waitForTimeout(3000);
                        
                        log(`   4. In koukai_main. checking for Search button...`);
                        const searchBtn = mainFrame.locator('input[value*="検索"], button:has-text("検索"), img[alt*="検索"]').first();
                        if (await searchBtn.count() > 0) {
                            log(`   🚀 Search button found! clicking...`);
                            await searchBtn.click();
                            await page.waitForTimeout(5000);
                            log(`   ✅ Table rows: ${await mainFrame.locator('table tr').count()}`);
                            break;
                        }
                    }
                }
            }
        }

    } catch (e: unknown) {
        log(`❌ Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
        await browser.close();
    }
}
testIkomaV10();

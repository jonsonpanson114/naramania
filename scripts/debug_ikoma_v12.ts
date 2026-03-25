
import { chromium } from 'playwright';
import fs from 'fs';

async function testIkomaV12() {
    const logFile = 'debug_log_v12.txt';
    const log = (msg: string) => { console.log(msg); fs.appendFileSync(logFile, msg + '\n'); };
    fs.writeFileSync(logFile, '--- V12 Debug Start (Click on Text) ---\n');
    
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto('https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680', { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);

        log('1. Main page. Clicking span:工事');
        await page.locator('span:has-text("工事")').first().click();
        await page.waitForTimeout(10000);

        const mainFrame = page.frames().find(f => f.url().includes('koukai_main'));
        if (mainFrame) {
            log('2. In main frame. Clicking static text "発注情報の検索"...');
            // Try clicking the text directly since Role/Button might be missing
            const searchEntry = mainFrame.locator('td:has-text("発注情報の検索"), div:has-text("発注情報の検索"), a:has-text("発注情報の検索")').first();
            if (await searchEntry.count() > 0) {
                log(`3. Found entry. Clicking...`);
                await searchEntry.click();
                await page.waitForTimeout(5000);
                
                log(`4. URL after click: ${mainFrame.url()}`);
                const searchBtn = mainFrame.locator('input[value*="検索"], button:has-text("検索")').first();
                if (await searchBtn.count() > 0) {
                    log('5. Search button found! Clicking...');
                    await searchBtn.click();
                    await page.waitForTimeout(5000);
                    log(`6. Result rows: ${await mainFrame.locator('table tr').count()}`);
                }
            } else {
                log('❌ Static text "発注情報の検索" NOT found');
                // Dump IDs of all elements to see what can be clicked
                const ids = await mainFrame.evaluate(() => Array.from(document.querySelectorAll('*[onclick]')).map(el => el.outerHTML));
                log(`   Onclick elements: ${JSON.stringify(ids)}`);
            }
        }

    } catch (e: unknown) {
        log(`❌ Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
        await browser.close();
    }
}
testIkomaV12();

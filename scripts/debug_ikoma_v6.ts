
import { chromium } from 'playwright';
import fs from 'fs';

async function testIkomaV6() {
    const logFile = 'debug_log_v6.txt';
    const log = (msg: string) => { console.log(msg); fs.appendFileSync(logFile, msg + '\n'); };
    fs.writeFileSync(logFile, '--- V6 Debug Start ---\n');
    
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto('https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680', { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);

        log('1. Main page loaded. Sleeping...');
        
        // Let's click SPAN:工事
        await page.locator('span:has-text("工事")').first().click();
        await page.waitForTimeout(10000); // Wait longer for frames to load content

        const frames = page.frames();
        log(`2. Frames found: ${frames.length}`);
        
        const mainFrame = frames.find(f => f.url().includes('koukai_main'));
        if (mainFrame) {
            log(`3. Found koukai_main. Dumping BODY content...`);
            const body = await mainFrame.evaluate(() => document.body.innerHTML);
            log(`   BODY Length: ${body.length}`);
            log(`   BODY Sample: ${body.slice(0, 500)}`);
            
            // Check for any input
            const inputs = await mainFrame.evaluate(() => {
                return Array.from(document.querySelectorAll('input')).map(i => ({ val: i.value, type: i.type, id: i.id }));
            });
            log(`4. Inputs in frame: ${JSON.stringify(inputs)}`);
            
            // Try to find search by index if value is empty/null
            const possibleSearch = mainFrame.locator('input[type="button"], input[type="submit"], button').first();
            if (await possibleSearch.count() > 0) {
                log('5. Clicking first button/input found in frame');
                await possibleSearch.click();
                await page.waitForTimeout(5000);
                log(`6. Rows after click: ${await mainFrame.locator('table tr').count()}`);
            }
        }

    } catch (e: unknown) {
        log(`❌ Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
        await browser.close();
    }
}
testIkomaV6();

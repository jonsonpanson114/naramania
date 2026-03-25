
import { chromium } from 'playwright';
import fs from 'fs';

async function testIkomaV4() {
    const logFile = 'debug_log_v4.txt';
    const log = (msg: string) => { console.log(msg); fs.appendFileSync(logFile, msg + '\n'); };
    fs.writeFileSync(logFile, '--- V4 Debug Start ---\n');
    
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto('https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680', { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);

        log('1. Page loaded. Clicking SPAN:工事...');
        await page.locator('span:has-text("工事")').first().click();
        await page.waitForTimeout(5000);

        log(`3. Current URL: ${page.url()}`);
        
        // Target frame: koukai_main
        const mainFrame = page.frames().find(f => f.url().includes('koukai_main'));
        if (mainFrame) {
            log('4. Found koukai_main frame. Waiting for Search button...');
            await mainFrame.waitForLoadState('domcontentloaded');
            
            // Check for buttons in the FRAME
            const btns = await mainFrame.locator('input[type="button"], button, img').all();
            for (const b of btns) {
                const val = await b.getAttribute('value');
                const alt = await b.getAttribute('alt');
                log(`   - Found element in frame: val='${val}' alt='${alt}'`);
                
                if (val?.includes('検索') || alt?.includes('検索')) {
                    log(`   🎯 Clicking Search [${val || alt}]`);
                    await b.click();
                    await page.waitForTimeout(5000);
                    
                    const rows = await mainFrame.locator('table tr').count();
                    log(`   ✅ Data rows found: ${rows}`);
                    if (rows > 1) {
                        const sample = await mainFrame.locator('table tr').nth(1).innerText();
                        log(`   📄 Sample: ${sample.replace(/\s+/g, ' ')}`);
                    }
                    break;
                }
            }
        } else {
            log('❌ koukai_main frame NOT found');
        }

    } catch (e: unknown) {
        log(`❌ Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
        await browser.close();
    }
}
testIkomaV4();

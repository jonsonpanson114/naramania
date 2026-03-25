
import { chromium } from 'playwright';
import fs from 'fs';

async function testIkomaV3() {
    const logFile = 'debug_log_v3.txt';
    const log = (msg: string) => { console.log(msg); fs.appendFileSync(logFile, msg + '\n'); };
    fs.writeFileSync(logFile, '--- V3 Debug Start ---\n');
    
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto('https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680', { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);

        log('1. Page loaded. Clicking SPAN:工事...');
        
        // Find the span with text "工事" and click its parent or itself
        const span工事 = page.locator('span:has-text("工事")').first();
        if (await span工事.count() > 0) {
            await span工事.click();
            log('2. Clicked SPAN:工事');
            await page.waitForTimeout(3000);
            log(`3. Current URL: ${page.url()}`);
            
            // Check for frames again - epi-cloud uses a main frame for search
            const frames = page.frames();
            log(`4. Frames count: ${frames.length}`);
            for (const f of frames) {
                log(`   - Frame URL: ${f.url()}`);
                // Inside the frame, look for search buttons
                const sBtn = f.locator('input[value*="検索"], button:has-text("検索")').first();
                if (await sBtn.count() > 0) {
                    log(`   🎯 Found Search Button in Frame: ${f.url()}`);
                    await sBtn.click();
                    log('   5. Clicked Search Button in Frame');
                    await page.waitForTimeout(4000);
                    
                    const rows = await f.locator('table tr').count();
                    log(`   ✅ Data rows found in Frame: ${rows}`);
                    
                    if (rows > 0) {
                        const firstRow = await f.locator('table tr').nth(1).innerText();
                        log(`   📄 Sample Data: ${firstRow.replace(/\s+/g, ' ')}`);
                    }
                }
            }
        } else {
            log('❌ SPAN:工事 NOT found');
        }

    } catch (e: unknown) {
        log(`❌ Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
        await browser.close();
    }
}
testIkomaV3();

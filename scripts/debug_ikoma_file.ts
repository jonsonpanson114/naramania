
import { chromium } from 'playwright';
import fs from 'fs';

async function testIkomaStepByStep() {
    const logFile = 'debug_log.txt';
    const log = (msg: string) => {
        console.log(msg);
        fs.appendFileSync(logFile, msg + '\n');
    };
    
    fs.writeFileSync(logFile, '--- Debug Start ---\n');
    
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const url = 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680';
        
        log(`Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
        
        log(`1. Navigated to ${page.url()}`);
        
        const kBtn = page.locator('input[value*="工事"], button:has-text("工事")').first();
        if (await kBtn.count() > 0) {
            log('2. Clicking Construction button');
            await kBtn.click();
            await page.waitForTimeout(3000);
        } else {
            log('2. Construction button NOT found');
        }

        log(`3. After click URL: ${page.url()}`);
        
        const frames = page.frames();
        log(`4. Frames count: ${frames.length}`);
        
        for (const f of frames) {
            log(`   - Frame URL: ${f.url()}`);
            const searchSelectors = ['input[value*="検索"]', 'button:has-text("検索")', 'input[type="button"][value="検索"]'];
            for (const sel of searchSelectors) {
                const sBtn = f.locator(sel).first();
                if (await sBtn.count() > 0) {
                    log(`   🎯 Found Search Button in Frame [${sel}]`);
                    await sBtn.click();
                    await page.waitForTimeout(3000);
                    const rows = await f.locator('table tr').count();
                    log(`   ✅ Rows found: ${rows}`);
                }
            }
        }

    } catch (e: unknown) {
        log(`❌ Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
        await browser.close();
    }
}

testIkomaStepByStep();

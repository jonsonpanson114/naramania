
import { chromium } from 'playwright';
import fs from 'fs';

async function testIkomaV9() {
    const logFile = 'debug_log_v9.txt';
    const log = (msg: string) => { console.log(msg); fs.appendFileSync(logFile, msg + '\n'); };
    fs.writeFileSync(logFile, '--- V9 Debug Start ---\n');
    
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto('https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680', { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);

        log('1. Clicking SPAN:工事');
        await page.locator('span:has-text("工事")').first().click();
        await page.waitForTimeout(10000);

        log(`2. Frames Check...`);
        const frames = page.frames();
        for (const f of frames) {
            log(`   Frame: ${f.url()}`);
            const body = await f.evaluate(() => document.body.innerHTML);
            log(`   Body Length: ${body.length}`);
            if (body.includes('<a')) log(`   🎯 Frame HAS links!`);
            if (body.includes('<input')) log(`   🎯 Frame HAS inputs!`);
        }

    } catch (e: unknown) {
        log(`❌ Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
        await browser.close();
    }
}
testIkomaV9();

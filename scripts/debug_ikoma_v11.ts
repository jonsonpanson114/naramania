
import { chromium } from 'playwright';
import fs from 'fs';

async function testIkomaV11() {
    const logFile = 'debug_log_v11.txt';
    const log = (msg: string) => { console.log(msg); fs.appendFileSync(logFile, msg + '\n'); };
    fs.writeFileSync(logFile, '--- V11 Debug Start ---\n');
    
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto('https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680', { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);

        log('1. Main page. Clicking span:工事');
        await page.locator('span:has-text("工事")').first().click();
        await page.waitForTimeout(10000);

        const frames = page.frames();
        log(`2. Frames: ${frames.length}`);
        
        for (const f of frames) {
            log(`   Checking Frame: ${f.url()}`);
            const text = await f.evaluate(() => document.body.innerText);
            log(`   Text Sample: ${text.slice(0, 100).replace(/\s+/g, ' ')}`);
            
            // Check for hidden inputs/scripts that might define the menu
            const scripts = await f.evaluate(() => Array.from(document.querySelectorAll('script')).map(s => s.src));
            log(`   Scripts: ${JSON.stringify(scripts)}`);
            
            // Try to find ANY interactable by role
            const buttons = await f.getByRole('button').all();
            const links = await f.getByRole('link').all();
            log(`   Role Check (buttons/links): ${buttons.length} / ${links.length}`);
            
            for (const b of buttons) {
                const name = await b.innerText();
                log(`   - Button: ${name}`);
            }
        }

    } catch (e: any) {
        log(`❌ Error: ${e.message}`);
    } finally {
        await browser.close();
    }
}
testIkomaV11();


import { chromium } from 'playwright';
import fs from 'fs';

async function testIkomaV8() {
    const logFile = 'debug_log_v8.txt';
    const log = (msg: string) => { console.log(msg); fs.appendFileSync(logFile, msg + '\n'); };
    fs.writeFileSync(logFile, '--- V8 Debug Start ---\n');
    
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto('https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680', { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);

        log('1. Page loaded. Clicking SPAN:工事...');
        await page.locator('span:has-text("工事")').first().click();
        await page.waitForTimeout(5000);

        log(`2. Current URL: ${page.url()}`);
        
        // Let's check ALL frames for links
        const frames = page.frames();
        log(`3. Total frames check: ${frames.length}`);
        for (const f of frames) {
            log(`   Checking Frame: ${f.url()}`);
            const links = await f.evaluate(() => {
                return Array.from(document.querySelectorAll('a')).map(a => ({ text: a.textContent?.trim(), href: a.href, html: a.outerHTML }));
            });
            log(`   Links found: ${links.length}`);
            if (links.length > 0) {
                log(`   Link Samples: ${JSON.stringify(links.slice(0, 10))}`);
            }
        }

    } catch (e: unknown) {
        log(`❌ Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
        await browser.close();
    }
}
testIkomaV8();

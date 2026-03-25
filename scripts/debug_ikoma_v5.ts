
import { chromium } from 'playwright';
import fs from 'fs';

async function testIkomaV5() {
    const logFile = 'debug_log_v5.txt';
    const log = (msg: string) => { console.log(msg); fs.appendFileSync(logFile, msg + '\n'); };
    fs.writeFileSync(logFile, '--- V5 Debug Start ---\n');
    
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto('https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680', { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);

        log('1. Page loaded. Clicking SPAN:工事...');
        await page.locator('span:has-text("工事")').first().click();
        await page.waitForTimeout(5000);
        
        // Let's list ALL frames again and search deep
        const frames = page.frames();
        log(`2. Frames found: ${frames.length}`);
        
        for (const f of frames) {
            const fUrl = f.url();
            log(`   Checking Frame: ${fUrl}`);
            try {
                // Get all buttons/inputs in this frame
                const results = await f.evaluate(() => {
                    const els = Array.from(document.querySelectorAll('input, button, img, a'));
                    return els.map(el => ({
                        tag: el.tagName,
                        val: (el as HTMLInputElement).value || '',
                        alt: (el as HTMLImageElement).alt || '',
                        text: el.textContent?.trim() || ''
                    }));
                });
                for (const r of results) {
                    if (r.val.includes('検索') || r.alt.includes('検索') || r.text.includes('検索')) {
                        log(`   🎯 Match in Frame [${fUrl}]: ${JSON.stringify(r)}`);
                        // Try clicking
                        await f.click(`${r.tag.toLowerCase()}[value*="検索"]`).catch(() => {});
                        await f.click(`${r.tag.toLowerCase()}:has-text("検索")`).catch(() => {});
                        await page.waitForTimeout(5000);
                        const rowCount = await f.locator('table tr').count();
                        log(`   ✅ Rows after click: ${rowCount}`);
                    }
                }
            } catch (e) {}
        }

    } catch (e: unknown) {
        log(`❌ Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
        await browser.close();
    }
}
testIkomaV5();

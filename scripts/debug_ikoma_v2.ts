
import { chromium } from 'playwright';
import fs from 'fs';

async function testIkomaVisual() {
    const logFile = 'debug_log_v2.txt';
    const log = (msg: string) => { console.log(msg); fs.appendFileSync(logFile, msg + '\n'); };
    fs.writeFileSync(logFile, '--- Visual Debug Start ---\n');
    
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto('https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680', { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);

        // Get all visible text that might be a button
        const allText = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a, button, input, span, div'))
                .map(el => ({
                    text: el.textContent?.trim(),
                    val: (el as HTMLInputElement).value,
                    tagName: el.tagName
                }))
                .filter(o => (o.text && o.text.length > 0) || (o.val && o.val.length > 0))
                .slice(0, 50); // Just top 50
        });

        log('Page Elements Sample:');
        allText.forEach(t => log(`  [${t.tagName}] text='${t.text}' val='${t.val}'`));

    } catch (e: unknown) {
        log(`❌ Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
        await browser.close();
    }
}
testIkomaVisual();

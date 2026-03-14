
import { chromium } from 'playwright';
import fs from 'fs';

async function verifyIkomaFinal() {
    const logFile = 'verify_ikoma.log';
    const log = (msg: string) => { console.log(msg); fs.appendFileSync(logFile, msg + '\n'); };
    fs.writeFileSync(logFile, '--- Verify Ikoma Start ---\n');
    
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto('https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680', { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);

        log('1. Page Loaded. Clicking span:工事');
        const span = page.locator('span:has-text("工事")').first();
        await span.click();
        await page.waitForTimeout(10000);

        const frames = page.frames();
        log(`2. Frames: ${frames.length}`);
        const mainFrame = frames.find(f => f.url().includes('koukai_main'));
        
        if (mainFrame) {
            log(`3. koukai_main found. URL: ${mainFrame.url()}`);
            const menuEntry = mainFrame.locator('td:has-text("発注情報の検索"), div:has-text("発注情報の検索"), a:has-text("発注情報の検索")').first();
            if (await menuEntry.count() > 0) {
                log('4. Clicking "発注情報の検索"');
                await menuEntry.click();
                await page.waitForTimeout(5000);
                
                log(`5. After menu click URL: ${mainFrame.url()}`);
                const searchBtn = mainFrame.locator('input[value*="検索"], button:has-text("検索"), img[alt*="検索"]').first();
                if (await searchBtn.count() > 0) {
                    log('6. Clicking Search button');
                    await searchBtn.click();
                    await page.waitForTimeout(5000);
                    
                    const rows = await mainFrame.locator('table tr').count();
                    log(`7. Success! Rows found: ${rows}`);
                } else {
                    log('❌ Search button NOT found');
                }
            } else {
                log('❌ "発注情報の検索" NOT found in frame');
                const text = await mainFrame.evaluate(() => document.body.innerText);
                log(`   Frame Text: ${text.replace(/\s+/g, ' ').slice(0, 200)}`);
            }
        } else {
            log('❌ koukai_main NOT found');
        }

    } catch (e: any) {
        log(`❌ Error: ${e.message}`);
    } finally {
        await browser.close();
    }
}
verifyIkomaFinal();

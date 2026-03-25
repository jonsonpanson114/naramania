
import { chromium } from 'playwright';
import fs from 'fs';

async function verifyIkomaExtract() {
    const logFile = 'verify_extract.log';
    const log = (msg: string) => { console.log(msg); fs.appendFileSync(logFile, msg + '\n'); };
    fs.writeFileSync(logFile, '--- Verify Extract Start ---\n');
    
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto('https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680', { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);

        await page.locator('span:has-text("工事")').first().click();
        await page.waitForTimeout(8000);

        const mainFrame = page.frames().find(f => f.url().includes('koukai_main'));
        if (mainFrame) {
            await mainFrame.locator('td:has-text("発注情報の検索")').first().click();
            await page.waitForTimeout(4000);
            
            await mainFrame.locator('input[value*="検索"]').first().click();
            await page.waitForTimeout(5000);
            
            const links = await mainFrame.locator('table a').all();
            log(`Found ${links.length} links in table`);
            
            for (let i = 0; i < Math.min(links.length, 5); i++) {
                const text = (await links[i].textContent())?.trim();
                const row = links[i].locator('xpath=ancestor::tr').first();
                const cells = await row.locator('td').all();
                let gyoshu = '';
                if (cells.length >= 2) gyoshu = await cells[1].innerText();
                log(`Item ${i}: text=[${text}] gyoshu=[${gyoshu}]`);
            }
        }
    } catch (e: unknown) {
        log(`❌ Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
        await browser.close();
    }
}
verifyIkomaExtract();

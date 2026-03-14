
import { chromium } from 'playwright';
import fs from 'fs';

async function seeTable() {
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
            await mainFrame.locator('input[value*="検索"], button:has-text("検索")').first().click();
            await page.waitForTimeout(5000);
            
            const tableText = await mainFrame.evaluate(() => {
                const trs = Array.from(document.querySelectorAll('table tr'));
                return trs.slice(0, 5).map(tr => tr.innerText.replace(/\s+/g, ' '));
            });
            fs.writeFileSync('table_sample.log', tableText.join('\n'));
        }
    } catch (e: any) {
        fs.writeFileSync('table_sample.log', 'Error: ' + e.message);
    } finally {
        await browser.close();
    }
}
seeTable();

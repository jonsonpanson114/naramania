
import { chromium } from 'playwright';
import fs from 'fs';

async function screenshotIkoma() {
    console.log('--- Ikoma Screenshot Debug Start ---');
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto('https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680', { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);

        // 1. トップ画面
        await page.screenshot({ path: 'ikoma_0_top.png' });

        // Click "工事"
        await page.locator('span:has-text("工事")').first().click();
        await page.waitForTimeout(8000);
        await page.screenshot({ path: 'ikoma_1_工事.png' });

        const mainFrame = page.frames().find(f => f.url().includes('koukai_main'));
        if (!mainFrame) throw new Error('koukai_main not found');

        // 2. メニュー画面
        // Click "発注情報の検索"
        await mainFrame.locator('td:has-text("発注情報の検索"), div:has-text("発注情報の検索"), a:has-text("発注情報の検索")').first().click();
        await page.waitForTimeout(4000);
        await page.screenshot({ path: 'ikoma_2_menu_clicked.png' });

        // 3. 検索画面
        const searchBtn = mainFrame.locator('input[value*="検索"], button:has-text("検索"), img[alt*="検索"]').first();
        if (await searchBtn.count() > 0) {
            await searchBtn.click();
            await page.waitForTimeout(5000);
            await page.screenshot({ path: 'ikoma_3_result.png' });

            // 4. 結果確認
            const html = await mainFrame.evaluate(() => document.body.innerHTML);
            fs.writeFileSync('ikoma_result_body.html', html);
            
            const tableCount = await mainFrame.locator('table').count();
            console.log(`Tables found: ${tableCount}`);
            
            const links = await mainFrame.locator('table a').count();
            console.log(`Links in tables: ${links}`);
        } else {
            console.log('❌ Search button not found');
        }

    } catch (e: unknown) {
        console.error('❌ Error:', e instanceof Error ? e.message : String(e));
    } finally {
        await browser.close();
    }
}
screenshotIkoma();

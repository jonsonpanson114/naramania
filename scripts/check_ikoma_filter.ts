
import { chromium } from 'playwright';
import { shouldKeepItem } from '../src/scrapers/common/filter';

async function checkIkomaFiltering() {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto('https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680', { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);

        await page.locator('span:has-text("工事")').first().click();
        await page.waitForTimeout(10000);

        const mainFrame = page.frames().find(f => f.url().includes('koukai_main'));
        if (!mainFrame) throw new Error('koukai_main not found');

        await mainFrame.locator('td:has-text("発注情報の検索")').first().click();
        await page.waitForTimeout(5000);

        const searchBtn = mainFrame.locator('input[value*="検索"], button:has-text("検索"), img[alt*="検索"]').first();
        await searchBtn.click();
        await page.waitForTimeout(5000);

        const links = await mainFrame.locator('table a').all();
        console.log(`Found ${links.length} total items in table.`);

        for (const link of links) {
            const text = (await link.textContent())?.trim() || '';
            const row = link.locator('xpath=ancestor::tr').first();
            const cells = await row.locator('td').all();
            let gyoshu = '';
            if (cells.length >= 2) {
                gyoshu = (await cells[1].innerText()).trim();
            }

            const keep = shouldKeepItem(text, gyoshu);
            console.log(`- Item: [${text}] / Gyoshu: [${gyoshu}] -> Keep: ${keep}`);
        }

    } catch (e: unknown) {
        console.error('Error:', e instanceof Error ? e.message : String(e));
    } finally {
        await browser.close();
    }
}
checkIkomaFiltering();

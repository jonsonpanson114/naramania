import { chromium } from 'playwright';
import fs from 'fs';

async function main() {
    const browser = await chromium.launch({ headless: true });
    try {
        const context = await browser.newContext({ acceptDownloads: true });
        const page = await context.newPage();

        await page.goto('http://www.ppi06.t-elbs.jp/DENCHO/PpiJGyomuStart.do?kinouid=GP5000_Top', { waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 5000));

        const fra1 = page.frame('fra_main1');
        const fraL = page.frames().find(f => f.name() === 'fra_mainL');
        await fraL!.locator('#P5515').click();
        await new Promise(r => setTimeout(r, 5000));

        let searchFrame = fra1!.childFrames().find(f => f.name() === 'fra_mainR');
        if (!searchFrame) searchFrame = page.frames().find(f => f.url().includes('1010') || f.name() === 'fra_mainR');

        await searchFrame!.selectOption('select[name="keisaiNen"]', '2025');
        await searchFrame!.selectOption('select[name="koshuCd"]', '200');
        await searchFrame!.selectOption('select[name="pageSize"]', '500');
        await searchFrame!.locator('#btnSearch').click();
        await new Promise(r => setTimeout(r, 10000));

        const resultsFrame = page.frames().find(f => f.url().includes('1020') || f.name() === 'fra_mainR') || searchFrame;

        console.log('Clicking first [表示] button');
        const displayBtn = resultsFrame!.locator('input[value="表示"]').first();

        const [popup] = await Promise.all([
            page.waitForEvent('popup'),
            displayBtn.click()
        ]);

        await popup.waitForLoadState('domcontentloaded');
        await new Promise(r => setTimeout(r, 5000));

        console.log('Capturing popup state...');
        await popup.screenshot({ path: 'popup_debug.png', fullPage: true });
        fs.writeFileSync('popup_debug.html', await popup.content());

        const downloadBtn = popup.locator('input[value="一括ダウンロード"]');
        console.log(`Download button count: ${await downloadBtn.count()}`);

        if (await downloadBtn.count() > 0) {
            console.log('Clicking download...');
            const [download] = await Promise.all([
                popup.waitForEvent('download', { timeout: 10000 }).catch(e => console.log('Download timeout missed!')),
                downloadBtn.first().click()
            ]);
            console.log('Download triggered successfully:', !!download);
        }

    } finally {
        await browser.close();
    }
}
main();

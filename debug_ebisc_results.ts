import { chromium } from 'playwright';
import fs from 'fs';

async function main() {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
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

        fs.writeFileSync('results_frame.html', await resultsFrame!.content());
        console.log('Saved results HTML');

        const rows = resultsFrame!.locator('table tr');
        const count = await rows.count();
        console.log('Row count:', count);

        let dump = '';
        for (let i = 0; i < count; i++) {
            dump += `--- ROW ${i} ---\n` + await rows.nth(i).innerText() + '\n';
        }
        fs.writeFileSync('rows_dump.txt', dump);
        console.log('Saved rows dump');

    } finally {
        await browser.close();
    }
}
main();

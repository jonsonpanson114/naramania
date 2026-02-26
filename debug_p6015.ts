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

        // P6015 is コンサル -> 入札結果
        await fraL!.locator('#P6015').click();
        await new Promise(r => setTimeout(r, 5000));

        let searchFrame = fra1!.childFrames().find(f => f.name() === 'fra_mainR');
        if (!searchFrame) searchFrame = page.frames().find(f => f.url().includes('1010') || f.name() === 'fra_mainR');

        // Check options for koshuCd
        const koshuOptions = await searchFrame!.evaluate(() => {
            const select = document.querySelector('select[name="koshuCd"]') as HTMLSelectElement;
            if (!select) return [];
            return Array.from(select.options).map(o => ({ value: o.value, text: o.text }));
        });
        console.log('Available koshuCd in P6015:', koshuOptions);

        await searchFrame!.selectOption('select[name="keisaiNen"]', '2025');
        // Let's try 300000 based on previous logic, or just don't set it to see all.
        try {
            await searchFrame!.selectOption('select[name="koshuCd"]', '300000');
        } catch (e: any) {
            console.log('Failed to select 300000. Selecting nothing to get all.');
        }
        await searchFrame!.selectOption('select[name="pageSize"]', '500');

        await searchFrame!.locator('#btnSearch').click();
        await new Promise(r => setTimeout(r, 10000));

        const resultsFrame = page.frames().find(f => f.url().includes('1020') || f.name() === 'fra_mainR') || searchFrame;

        const rows = resultsFrame!.locator('table tr');
        const count = await rows.count();
        console.log('Row count for P6015:', count);

        if (count > 0) {
            let dump = '';
            for (let i = 0; i < Math.min(count, 5); i++) {
                dump += `--- P6015 ROW ${i} ---\n` + await rows.nth(i).innerText() + '\n';
            }
            console.log(dump);
        }
    } finally {
        await browser.close();
    }
}
main();

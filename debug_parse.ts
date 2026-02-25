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
        const rows = resultsFrame!.locator('table tr');
        const count = await rows.count();

        let extracted = [];
        for (let i = 1; i < count; i++) {
            const rowText = await rows.nth(i).innerText();
            const lines = rowText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            if (lines.length < 6) continue;
            let title = lines[lines.length - 2];
            let rawDate = lines[lines.length - 3];
            extracted.push({ title, rawDate });
        }
        console.log(JSON.stringify(extracted, null, 2));
    } finally {
        await browser.close();
    }
}
main();

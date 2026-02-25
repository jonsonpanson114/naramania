import { chromium } from 'playwright';
import fs from 'fs';

async function main() {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto('http://www.ppi06.t-elbs.jp/DENCHO/PpiJGyomuStart.do?kinouid=GP5000_Top', { waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 5000));

        const fraL = page.frames().find(f => f.name() === 'fra_mainL');
        if (!fraL) {
            console.log('No fra_mainL');
            return;
        }

        await fraL.locator('#P5515').click();
        await new Promise(r => setTimeout(r, 5000));

        const fra1 = page.frame('fra_main1');
        let searchFrame = fra1?.childFrames().find(f => f.name() === 'fra_mainR');
        if (!searchFrame) {
            searchFrame = page.frames().find(f => f.url().includes('1010') || f.name() === 'fra_mainR');
        }

        if (!searchFrame) {
            console.log('No searchFrame');
            // list frames for debug
            console.log(page.frames().map(f => f.name() + ' : ' + f.url()));
            return;
        }

        await searchFrame.selectOption('select[name="keisaiNen"]', '2025');

        const html = await searchFrame.content();
        fs.writeFileSync('search_frame.html', html);
        console.log('Saved search_frame.html');

        await searchFrame.locator('#btnSearch').click();
        await new Promise(r => setTimeout(r, 10000));

        // The frame name might stay fra_mainR but the content changes
        const resultsFrame = page.frames().find(f => f.name() === 'fra_mainR');
        if (resultsFrame) {
            fs.writeFileSync('results_frame.html', await resultsFrame.content());
            console.log('Saved results_frame.html');
        }
    } finally {
        await browser.close();
    }
}

main();

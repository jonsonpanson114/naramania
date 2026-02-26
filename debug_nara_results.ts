import { chromium } from 'playwright';
import * as fs from 'fs';

async function main() {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto('http://www.ppi06.t-elbs.jp/DENCHO/PpiJGyomuStart.do?kinouid=GP5000_Top', { waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 5000));

        const fraL = page.frames().find(f => f.name() === 'fra_mainL');
        console.log('Clicking Consulting...');
        await fraL!.locator('#P6010').click();
        await new Promise(r => setTimeout(r, 5000));

        let searchFrame = page.frames().find(f => f.url().includes('1010'));
        if (searchFrame) {
            console.log('Searching for known item...');
            await searchFrame.selectOption('select[name="keisaiNen"]', '2025').catch(() => { });
            await searchFrame.fill('input[name="ankenNo"]', '29001013060020250258');
            await searchFrame.locator('input[type="button"][value*="検索"], #btnSearch').first().click();
            await new Promise(r => setTimeout(r, 10000));

            const resultsFrame = page.frames().find(f => f.url().includes('1020')) || searchFrame;
            const html = await resultsFrame.content();
            fs.writeFileSync('debug_results_p6010.html', html);
            console.log('Results page saved to debug_results_p6010.html');

            const tables = await resultsFrame.evaluate(() => {
                return Array.from(document.querySelectorAll('table')).map(t => ({
                    id: t.id,
                    className: t.className,
                    rowCount: t.rows.length
                }));
            });
            console.log('Tables found:', tables);
        }
    } finally {
        await browser.close();
    }
}
main();

import { chromium } from 'playwright';

async function main() {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto('http://www.ppi06.t-elbs.jp/DENCHO/PpiJGyomuStart.do?kinouid=GP5000_Top', { waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 5000));

        const fraL = page.frames().find(f => f.name() === 'fra_mainL');
        if (fraL) {
            const html = await fraL.content();
            const fs = require('fs');
            fs.writeFileSync('menu_dump.html', html);
            console.log('Menu dump saved to menu_dump.html');

            // Log all IDs starting with P
            const ids = await fraL.evaluate(() => {
                return Array.from(document.querySelectorAll('[id^="P"]')).map(el => el.id + ' : ' + (el as HTMLElement).innerText);
            });
            console.log('Found Menu IDs:', ids);
        } else {
            console.error('Frame fra_mainL not found');
        }
    } finally {
        await browser.close();
    }
}
main();

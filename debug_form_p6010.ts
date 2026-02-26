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

        // P6010 is Consulting -> Project Information
        console.log('Clicking P6010...');
        await fraL!.locator('#P6010').click();
        await new Promise(r => setTimeout(r, 5000));

        let searchFrame = page.frames().find(f => f.url().includes('1010') || f.name() === 'fra_mainR');
        if (searchFrame) {
            const html = await searchFrame.content();
            fs.writeFileSync('search_form_p6010.html', html);
            console.log('Search form P6010 saved.');

            const inputs = await searchFrame.evaluate(() => {
                return Array.from(document.querySelectorAll('input, select')).map(el => {
                    return {
                        tag: el.tagName,
                        name: el.getAttribute('name'),
                        id: el.id,
                        type: el.getAttribute('type'),
                        value: (el as any).value
                    };
                });
            });
            console.log('Input fields:', inputs);
        } else {
            console.error('Search frame not found');
        }
    } finally {
        await browser.close();
    }
}
main();

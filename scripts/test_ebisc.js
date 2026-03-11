const { chromium } = require('playwright');

(async () => {
    console.log('Testing e-BISC top page...');
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto('http://www.ppi06.t-elbs.jp/DENCHO/PpiJGyomuStart.do?kinouid=GP5000_Top', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);

        console.log('Page URL:', page.url());
        const bodyText = await page.evaluate(() => document.body.innerText);
        console.log('Body Text Snippet:');
        console.log(bodyText.substring(0, 500));

        const frames = page.frames();
        console.log('Frames found:', frames.map(f => f.name() || f.url()));
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await browser.close();
    }
})();

import { chromium } from 'playwright';

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('http://www.ppi06.t-elbs.jp/DENCHO/PpiJGyomuStart.do?kinouid=GP5000_Top', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 5000));

    console.log('--- Frame Tree ---');
    function dumpFrames(frame, indent) {
        console.log(`${indent}- Name: "${frame.name()}", URL: ${frame.url()}`);
        for (const child of frame.childFrames()) {
            dumpFrames(child, indent + '  ');
        }
    }
    dumpFrames(page.mainFrame(), '');

    await browser.close();
}

main();

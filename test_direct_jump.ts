import { chromium } from 'playwright';

async function main() {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        // First establish session
        console.log('Establishing session...');
        await page.goto('http://www.ppi06.t-elbs.jp/DENCHO/PpiJGyomuStart.do?kinouid=GP5000_Top', { waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 5000));

        // Try direct jump to a known ankenId (Consulting - Information)
        const ankenId = '29001013060020250258';
        console.log(`Attempting direct jump to ankenId: ${ankenId}...`);

        // Use fra_main1 or appropriate frame? 
        // Detail pages often load in a frame or as a full page reload if JS initiated.
        // Let's try navigating the whole page first.
        await page.goto(`http://www.ppi06.t-elbs.jp/DENCHO/GP5510_1020?ankenId=${ankenId}`, { waitUntil: 'networkidle' });

        await new Promise(r => setTimeout(r, 5000));
        const frames = page.frames();
        console.log('Frames after jump:', frames.map(f => f.name() + ' : ' + f.url()));

        const content = await page.content();
        const fs = require('fs');
        fs.writeFileSync('direct_jump_result.html', content);

        if (content.includes('詳細') || content.includes('民俗博物館')) {
            console.log('SUCCESS: Direct jump worked!');
        } else {
            console.log('FAILED: Direct jump did not show the expected content.');
            if (content.includes('エラー')) {
                console.log('Error message found in page.');
            }
        }
    } finally {
        await browser.close();
    }
}
main();

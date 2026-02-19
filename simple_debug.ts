
import { chromium } from 'playwright';
import fs from 'fs';

async function bug() {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        console.log('Goto PPI...');
        // Nara City PPI
        await page.goto('https://nara.efftis.jp/PPI/Public/PPUBC00100?kikanno=0201', { waitUntil: 'domcontentloaded', timeout: 30000 });

        const title = await page.title();
        console.log(`Title: ${title}`);

        const content = await page.content();
        fs.writeFileSync('debug_ppi_content.html', content);

        const frames = page.frames();
        console.log(`Frames: ${frames.length}`);
        frames.forEach(f => console.log(`Frame: ${f.name()} | ${f.url()}`));

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
}
bug();

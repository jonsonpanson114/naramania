
import { chromium } from 'playwright';
import fs from 'fs';

async function main() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    console.log('--- Nara City List Page Dump ---');
    try {
        await page.goto('https://www.city.nara.lg.jp/site/nyusatu-keiyaku/list339-847.html', { timeout: 30000 });
        const content = await page.content();
        fs.writeFileSync('nara_city_list.html', content);
        console.log('Saved nara_city_list.html');

        // Find links on this page
        const links = await page.getByRole('link').all();
        for (const link of links) {
            const text = await link.textContent();
            const href = await link.getAttribute('href');
            if (text?.includes('工事') || text?.includes('建築')) {
                console.log(`RELEVANT LINK: "${text.trim()}" | HREF: ${href}`);
            }
        }
    } catch (e) {
        console.error('Error:', e);
    }
    await browser.close();
}
main();

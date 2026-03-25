
import { chromium } from 'playwright';
import fs from 'fs';

async function dumpIkomaTable() {
    console.log('--- Ikoma HTML Dump Start ---');
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto('https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680', { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);

        // Click "工事"
        await page.locator('span:has-text("工事")').first().click();
        await page.waitForTimeout(10000);

        const mainFrame = page.frames().find(f => f.url().includes('koukai_main'));
        if (!mainFrame) throw new Error('koukai_main not found');

        // Click "発注情報の検索"
        await mainFrame.locator('td:has-text("発注情報の検索"), div:has-text("発注情報の検索"), a:has-text("発注情報の検索")').first().click();
        await page.waitForTimeout(5000);

        // Click "検索"
        const searchBtn = mainFrame.locator('input[value*="検索"], button:has-text("検索"), img[alt*="検索"]').first();
        await searchBtn.click();
        await page.waitForTimeout(5000);

        // Dump table HTML
        const html = await mainFrame.evaluate(() => {
            const table = document.querySelector('table');
            return table ? table.outerHTML : 'No table found';
        });
        fs.writeFileSync('ikoma_table_dump.html', html);
        console.log('HTML dumped to ikoma_table_dump.html');

        // Check for links specifically
        const links = await mainFrame.evaluate(() => {
            return Array.from(document.querySelectorAll('table a')).map(a => ({
                text: a.textContent?.trim(),
                href: a.getAttribute('href'),
                outer: a.outerHTML
            }));
        });
        console.log(`Found ${links.length} links in table through querySelectorAll('table a')`);
        if (links.length > 0) {
            console.log('Sample link:', JSON.stringify(links[0]));
        } else {
            // Check all elements in table
            const allElements = await mainFrame.evaluate(() => {
                const trs = Array.from(document.querySelectorAll('table tr'));
                return trs.slice(1, 3).map(tr => ({
                    text: tr.innerText.replace(/\s+/g, ' '),
                    html: tr.innerHTML
                }));
            });
            console.log('First few rows HTML:', JSON.stringify(allElements));
        }

    } catch (e: unknown) {
        console.error('❌ Error:', e instanceof Error ? e.message : String(e));
    } finally {
        await browser.close();
    }
}
dumpIkomaTable();

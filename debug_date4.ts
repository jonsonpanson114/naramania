import { chromium } from 'playwright';

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.route('**/*', async (route) => {
        const response = await route.fetch();
        const headers = response.headers();
        const contentType = headers['content-type'] || '';

        if (contentType.includes('text/html')) {
            const buffer = await response.body();
            // Server sends UTF-8 but claims Shift_JIS. 
            // We force the browser to read it as UTF-8.
            await route.fulfill({
                response,
                body: buffer,
                headers: { ...headers, 'content-type': 'text/html; charset=utf-8' }
            });
        } else {
            await route.fallback();
        }
    });

    await page.goto('https://nara.efftis.jp/PPI/Public/PPUBC00100?kikanno=0201');
    await page.goto('https://nara.efftis.jp/PPI/Public/PPUBC00100!link?screenId=PPUBC00700&chotatsu_kbn=00');

    // First print out the search button value
    const inputs = await page.locator('input[type="button"], input[type="submit"]').all();
    for (const input of inputs) {
        console.log("Button value:", await input.getAttribute('value'));
    }

    try {
        await page.locator('input[value="検\u3000索"]').click({ timeout: 5000 });
        await page.waitForTimeout(2000);

        const rows = await page.locator('table tr').all();
        console.log(`Total rows after click: ${rows.length}`);
        for (let i = 0; i < rows.length - 1; i++) {
            const cells = await rows[i].locator('td').all();
            if (cells.length === 7) {
                const contractNo = await cells[0].innerText();
                if (contractNo.includes('契約番号')) continue;

                const nextRowCells = await rows[i + 1].locator('td').all();
                const nextRowTexts = await Promise.all(nextRowCells.map(c => c.innerText()));
                console.log(`Data Row Found (${contractNo.trim()}):`, nextRowTexts.map(t => t.replace(/\s+/g, ' ')));
                break; // Just need 1 example 
            }
        }
    } catch (e) {
        console.log("Failed to click or find rows", e);
    }
    await browser.close();
}
main();

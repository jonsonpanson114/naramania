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
            const text = new TextDecoder('shift-jis').decode(buffer);
            await route.fulfill({
                response,
                body: text,
                headers: { ...headers, 'content-type': 'text/html; charset=utf-8' }
            });
        } else {
            await route.fallback();
        }
    });

    await page.goto('https://nara.efftis.jp/PPI/Public/PPUBC00100?kikanno=0201');
    await page.goto('https://nara.efftis.jp/PPI/Public/PPUBC00100!link?screenId=PPUBC00700&chotatsu_kbn=00');

    await page.locator('input[value="検\u3000索"]').click();
    await page.waitForTimeout(2000);

    const rows = await page.locator('table tr').all();
    console.log(`Total rows found: ${rows.length}`);
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
    await browser.close();
}
main();

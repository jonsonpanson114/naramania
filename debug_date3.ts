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

    const inputs = await page.locator('input[type="button"], input[type="submit"]').all();
    for (const input of inputs) {
        console.log("Button value:", await input.getAttribute('value'));
    }
    await browser.close();
}
main();

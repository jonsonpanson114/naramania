import { chromium } from 'playwright';

async function main() {
    console.log('Launching browser...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('[List] Accessing Nara Pref PPI system...');
    await page.goto('http://www.ppi06.t-elbs.jp/DENCHO/PpiJGyomuStart.do?kinouid=GP5000_Top', { waitUntil: 'domcontentloaded' });

    // Wait for the side menu frame
    await page.waitForTimeout(5000);
    const fraL = page.frames().find(f => f.name() === 'fra_mainL');
    if (!fraL) {
        console.error('Initial fra_mainL not found.');
        await browser.close();
        return;
    }

    const targetId = 'P6015';

    console.log(`\nClicking 業務 button: #${targetId}`);
    const menuBtn = fraL.locator(`#${targetId}`);
    await menuBtn.waitFor({ state: 'visible', timeout: 10000 });
    await menuBtn.click();
    await page.waitForTimeout(5000);

    // Now find the search frame
    console.log('[List] Discovering search form frame for 業務...');
    let searchFrame = page.frames().find(f => f.name() === 'fra_mainR' || f.url().includes('1010'));

    if (!searchFrame) {
        // Wait another 5 seconds and check again
        await page.waitForTimeout(5000);
        searchFrame = page.frames().find(f => f.name() === 'fra_mainR' || f.url().includes('1010'));
    }

    if (!searchFrame) {
        console.error('Failed to discover search form frame. Dump frames:');
        for (const f of page.frames()) {
            console.log(f.name(), f.url());
        }
        await browser.close();
        return;
    }

    // Dump the options for koshuCd (業種)
    console.log('--- koshuCd Options ---');
    const options = await searchFrame.locator('select[name="koshuCd"] option').elementHandles();
    for (const opt of options) {
        const val = await opt.getAttribute('value');
        const text = await opt.textContent();
        console.log(`Value: ${val} -> ${text?.trim()}`);
    }

    await browser.close();
}

main().catch(console.error);

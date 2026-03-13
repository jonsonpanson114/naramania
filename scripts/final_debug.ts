
import { chromium } from 'playwright';

async function finalDebug(city: string, url: string, screenshotPath: string) {
    console.log(`\n=== Final Debugging ${city} ===`);
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);

        console.log(`[${city}] Clicking "工事"...`);
        await page.locator('span:has-text("工事")').first().click();
        await page.waitForTimeout(8000);

        console.log(`[${city}] Searching for menu...`);
        let menuFrame: any = null;
        for (const frame of page.frames()) {
            const entry = frame.locator('td:has-text("発注情報"), a:has-text("発注情報"), span:has-text("発注情報"), img[alt*="発注情報"]').first();
            if (await entry.count() > 0) {
                console.log(`[${city}] Menu found in frame "${frame.name()}"`);
                await entry.click();
                menuFrame = frame;
                break;
            }
        }

        if (!menuFrame) {
            console.log(`[${city}] Menu NOT found.`);
            await page.screenshot({ path: `${screenshotPath}_no_menu.png`, fullPage: true });
            return;
        }

        await page.waitForTimeout(5000);

        console.log(`[${city}] Searching for search button...`);
        let searchBtn: any = null;
        for (const frame of page.frames()) {
            searchBtn = frame.locator('input[value*="検索"], button:has-text("検索"), img[alt*="検索"]').first();
            if (await searchBtn.count() > 0) {
                console.log(`[${city}] Search button found in frame "${frame.name()}"`);
                await searchBtn.click();
                break;
            }
        }

        await page.waitForTimeout(8000);
        await page.screenshot({ path: `${screenshotPath}_results.png`, fullPage: true });

        console.log(`[${city}] Links in all frames:`);
        for (const frame of page.frames()) {
            const links = await frame.locator('a').all();
            if (links.length > 0) {
                console.log(`  - Frame "${frame.name()}" has ${links.length} total links.`);
                const firstLink = links[0];
                const text = (await firstLink.textContent())?.trim();
                const html = await firstLink.evaluate(el => el.outerHTML);
                console.log(`    First link text: "${text}", HTML: ${html.slice(0, 100)}`);
            }
        }

    } catch (e: any) {
        console.error(`[${city}] Error:`, e.stack);
    } finally {
        await browser.close();
    }
}

async function run() {
    await finalDebug('Ikoma', 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680', 'ikoma_final');
    await finalDebug('Uda', 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200700', 'uda_final');
}

run();

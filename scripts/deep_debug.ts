
import { chromium } from 'playwright';
import { shouldKeepItem, EXCLUSION_KEYWORDS } from '../src/scrapers/common/filter';

async function debugScraper(city: string, url: string) {
    console.log(`\n=== Debugging ${city} ===`);
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);

        // Try "工事"
        console.log(`[${city}] Clicking "工事"...`);
        const span = page.locator('span:has-text("工事")').first();
        if (await span.count() > 0) {
            await span.click();
        } else {
            await page.getByText('工事', { exact: true }).click({ timeout: 5000 });
        }
        await page.waitForTimeout(10000);

        // Find Menu
        let menuFrame: any = null;
        for (const frame of page.frames()) {
            const entry = frame.locator('td:has-text("発注情報"), a:has-text("発注情報"), span:has-text("発注情報")').first();
            if (await entry.count() > 0) {
                console.log(`[${city}] Menu found in frame "${frame.name()}"`);
                await entry.click();
                menuFrame = frame;
                break;
            }
        }

        if (!menuFrame) {
            console.log(`[${city}] Menu NOT found in any frame.`);
            // List all frames content briefly
            for (const frame of page.frames()) {
                const body = await frame.evaluate(() => document.body.innerText.slice(0, 200));
                console.log(`  - Frame "${frame.name()}": ${body.replace(/\n/g, ' ')}...`);
            }
            return;
        }

        await page.waitForTimeout(5000);

        // Find Search Button
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

        // Extract Links
        console.log(`[${city}] Final Results Analysis:`);
        for (const frame of page.frames()) {
            const links = await frame.locator('table a').all();
            if (links.length > 0) {
                console.log(`  - Frame "${frame.name()}" has ${links.length} links.`);
                for (let i = 0; i < Math.min(links.length, 5); i++) {
                    const text = (await links[i].textContent())?.trim() || '';
                    const row = links[i].locator('xpath=ancestor::tr').first();
                    const cells = await row.locator('td').all();
                    let gyoshu = (await cells[1]?.innerText() || '').trim();
                    const keep = shouldKeepItem(text, gyoshu);
                    console.log(`    [${i}] "${text}" (業種: ${gyoshu}) -> Keep: ${keep}`);
                    if (!keep) {
                        const matched = EXCLUSION_KEYWORDS.filter(kw => (text + gyoshu).includes(kw));
                        console.log(`      (Excluded by: ${matched.join(', ')})`);
                    }
                }
            }
        }

    } catch (e: any) {
        console.error(`[${city}] Error:`, e.message);
    } finally {
        await browser.close();
    }
}

async function run() {
    await debugScraper('Ikoma', 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680');
    await debugScraper('Uda', 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200700');
}

run();

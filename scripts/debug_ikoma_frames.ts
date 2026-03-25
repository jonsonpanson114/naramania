
import { chromium } from 'playwright';

async function listFrames() {
    console.log('--- Ikoma Frame Analysis Start ---');
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto('https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680');
        await page.waitForTimeout(5000);

        console.log('Clicking "工事"...');
        await page.locator('span:has-text("工事")').first().click();
        await page.waitForTimeout(10000);

        console.log('Frame Hierarchy:');
        const showFrames = (frame: import('playwright').Frame, indent = '') => {
            console.log(`${indent}- Name: ${frame.name() || '(none)'}, URL: ${frame.url()}`);
            for (const child of frame.childFrames()) {
                showFrames(child, indent + '  ');
            }
        };

        showFrames(page.mainFrame());

        // Also check if any frame contains "発注情報"
        for (const frame of page.frames()) {
            const hasText = await frame.evaluate(() => document.body.innerText.includes('発注情報'));
            if (hasText) {
                console.log(`[FOUND TEXT] Frame "${frame.name()}" contains "発注情報"`);
            }
        }

    } catch (e: unknown) {
        console.error('Error:', e instanceof Error ? e : String(e));
    } finally {
        await browser.close();
        console.log('--- Analysis End ---');
    }
}

listFrames();

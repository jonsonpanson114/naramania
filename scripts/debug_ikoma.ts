
import { chromium } from 'playwright';

async function testIkoma() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const url = 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680';
    
    console.log(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    console.log(`Current URL: ${page.url()}`);
    
    // Check for buttons
    const buttons = await page.locator('input, button, a').all();
    for (const btn of buttons) {
        const text = await btn.textContent();
        const value = await btn.getAttribute('value');
        const alt = await btn.getAttribute('alt');
        if (text?.includes('工事') || value?.includes('工事') || alt?.includes('工事')) {
            console.log(`Found Construction Button: text=${text}, value=${value}, alt=${alt}`);
        }
    }

    // Try clicking '工事'
    await page.getByText('工事', { exact: true }).click().catch(e => console.log('Click failed', e.message));
    await page.waitForTimeout(3000);
    console.log(`After click URL: ${page.url()}`);

    // Check for frames
    const frames = page.frames();
    console.log(`Found ${frames.length} frames`);
    for (const f of frames) {
        console.log(`Frame URL: ${f.url()}`);
    }

    await browser.close();
}

testIkoma();

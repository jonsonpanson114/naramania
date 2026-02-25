import { chromium } from 'playwright';

async function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('Starting e-BISC scraper debug...');
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto('http://www.ppi06.t-elbs.jp/DENCHO/PpiJGyomuStart.do?kinouid=GP5000_Top', { waitUntil: 'domcontentloaded' });

        await delay(5000);
        let gp10f = page.frames().find(f => f.url().includes('GP5000_10F'));
        let menuFrame = gp10f?.childFrames().find(f => f.url().includes('GP5000_Menu'));
        let fra1 = page.frame('fra_main1');

        if (!menuFrame || !fra1) {
            console.log('Retrying frames...');
            await delay(5000);
            gp10f = page.frames().find(f => f.url().includes('GP5000_10F'));
            menuFrame = gp10f?.childFrames().find(f => f.url().includes('GP5000_Menu'));
            fra1 = page.frame('fra_main1');
        }

        if (!menuFrame || !fra1) {
            console.error('Failed to get required frames. Current frames:');
            for (const f of page.frames()) {
                console.log(' - ' + f.url());
            }
            console.log('Page Title:', await page.title());
            console.log('Page Content Preview:');
            const content = await page.content();
            console.log(content.substring(0, 500));
            return;
        }

        await menuFrame.waitForLoadState('load');

        console.log('Navigating to Construction Results (入札結果)...');
        await Promise.all([
            fra1.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            menuFrame.evaluate((url: string) => (window as any).pf_VidDsp_btnReferenceClick(url), '/DENCHO/GP5515_1010?gyoshuKbnCd=00')
        ]);

        await delay(1000);

        console.log('Searching for 2025 projects...');
        await fra1.selectOption('select[name="keisaiNen"]', '2025').catch(() => { });
        await Promise.all([
            fra1.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            fra1.evaluate(() => {
                const topW = window.top as any;
                if (topW?.fra_hidden) topW.fra_hidden.submit_flag = 0;
                (window as any).fnc_btnSearch_Clicked();
            })
        ]);

        await delay(3000);

        console.log('Extracting rows...');
        const rows = fra1.locator('table tr');
        const count = await rows.count();
        console.log(`Found ${count} rows`);

        for (let i = 0; i < Math.min(count, 15); i++) {
            const rowText = await rows.nth(i).innerText();
            console.log(`--- Row ${i} ---`);
            console.log(rowText.replace(/\n+/g, ' | '));
        }

    } finally {
        await browser.close();
    }
}
main().catch(console.error);

const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        console.log('Navigating to Top...');
        await page.goto('http://www.ppi06.t-elbs.jp/DENCHO/PpiJGyomuStart.do?kinouid=GP5000_Top', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(5000);

        const printFrames = () => {
            console.log('\n--- Current Frames ---');
            page.frames().forEach((f, i) => {
                console.log(`[${i}] name: "${f.name()}", url: "${f.url()}"`);
            });
        };

        printFrames();

        const gp10f = page.frames().find(f => f.url().includes('GP5000_10F'));
        const menuFrame = gp10f?.childFrames().find(f => f.url().includes('GP5000_Menu'));

        if (!menuFrame) throw new Error('Menu frame not found');

        console.log('\nClicking 建設工事 -> 入札結果 (GP5515_1010)...');
        await Promise.all([
            page.waitForLoadState('networkidle'),
            menuFrame.evaluate((url) => window.parent.pf_VidDsp_btnReferenceClick(url), '/DENCHO/GP5515_1010?gyoshuKbnCd=00').catch(e => {
                // Ignore error if pf_VidDsp_btnReferenceClick is not on parent, let's try direct
                return menuFrame.evaluate((url) => {
                    if (typeof (window as any).pf_VidDsp_btnReferenceClick === 'function') {
                        (window as any).pf_VidDsp_btnReferenceClick(url);
                    } else if (typeof (window.parent as any).pf_VidDsp_btnReferenceClick === 'function') {
                        (window.parent as any).pf_VidDsp_btnReferenceClick(url);
                    } else {
                        throw new Error('pf_VidDsp_btnReferenceClick not found');
                    }
                }, '/DENCHO/GP5515_1010?gyoshuKbnCd=00');
            })
        ]);

        await page.waitForTimeout(5000);
        printFrames();

        // Find search form frame
        const searchFrame1 = page.frames().find(f => f.url().includes('1010'));
        if (searchFrame1) {
            console.log('\nSearch Frame GP5515_1010 HTML snippet:');
            const html = await searchFrame1.content();
            console.log(html.substring(0, 500));
            console.log('Has keisaiNen?', await searchFrame1.locator('select[name="keisaiNen"]').count());
            console.log('Has koshuCd?', await searchFrame1.locator('select[name="koshuCd"]').count());
            console.log('Has search button?', await searchFrame1.locator('input[value*="検索"], #btnSearch').count());
        } else {
            console.log('\nGP5515_1010 NOT FOUND in frames!');
        }

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
})();

import 'dotenv/config';
import { chromium } from 'playwright';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
import { extractBiddingInfoFromText } from './src/services/gemini_service';

async function main() {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        console.log('[1] Accessing Nara Prefecture PPI system...');
        await page.goto('http://www.ppi06.t-elbs.jp/DENCHO/PpiJGyomuStart.do?kinouid=GP5000_Top', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);

        const gp10f = page.frames().find(f => f.url().includes('GP5000_10F'));
        const menuFrame = gp10f?.childFrames().find(f => f.url().includes('GP5000_Menu'));
        const fra1 = page.frame('fra_main1');

        if (!menuFrame || !fra1) {
            console.error('Failed to get required frames.');
            return;
        }

        console.log('[2] Navigating to Results (入札結果)...');
        // gyoshuKbnCd=00 (工事) 入札結果
        await Promise.all([
            fra1.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }),
            menuFrame.evaluate((url: string) => (window as any).pf_VidDsp_btnReferenceClick(url), '/DENCHO/GP5515_1010?gyoshuKbnCd=00'),
        ]);
        await page.waitForTimeout(2000);

        console.log('[3] Performing Search...');
        await fra1.selectOption('select[name="keisaiNen"]', '2025').catch(() => { });
        await fra1.evaluate(() => {
            const topW = window.top as any;
            if (topW?.fra_hidden) topW.fra_hidden.submit_flag = 0;
            (window as any).fnc_btnSearch_Clicked();
        });
        await fra1.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);

        console.log('[4] Clicking Detail for the first result (Handling Popup)...');
        const detailBtns = await fra1.locator('input[value="表示"]').all();

        let detailPage;
        if (detailBtns.length > 0) {
            const pagePromise = page.context().waitForEvent('page', { timeout: 15000 }).catch(() => null);
            await detailBtns[0].click();
            detailPage = await pagePromise;

            if (!detailPage) {
                console.error('Popup did not open.');
                return;
            }
            await detailPage.waitForLoadState('domcontentloaded');
            await detailPage.waitForTimeout(3000);
        } else {
            console.error('No detail button found.');
            return;
        }

        console.log('[5] Locating Download Button...');
        const downloadBtn = detailPage.locator('input[value="一括ダウンロード"]');

        if (await downloadBtn.count() === 0) {
            console.error('No download button found.');
            return;
        }

        console.log('[6] Clicking Download All & Intercepting Stream...');
        const [download] = await Promise.all([
            detailPage.waitForEvent('download'),
            downloadBtn.first().click()
        ]);

        const stream = await download.createReadStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        const buffer = Buffer.concat(chunks);
        console.log(`[7] Extracted Text from buffer (${buffer.length} bytes)...`);

        let fullText = '';
        if (pdf.PDFParse) {
            const parser = new pdf.PDFParse({ data: buffer });
            const textResult = await parser.getText();
            if (textResult && textResult.pages) {
                fullText = textResult.pages.map((p: any) => p.text).join('\n\n');
            } else if (textResult && textResult.text) {
                fullText = textResult.text;
            }
        } else {
            const data = await pdf(buffer);
            fullText = data.text;
        }

        console.log(`[8] Extracted text length: ${fullText.length} characters.`);
        console.log(`[9] Sending to Gemini...`);

        const intelligence = await extractBiddingInfoFromText(fullText);

        console.log("\n=== 💎 NARAPREF EXTRACTED INTELLIGENCE 💎 ===");
        console.log(JSON.stringify(intelligence, null, 2));
        console.log("============================================\n");


    } catch (e: any) {
        console.error('Error in workflow:', e.message || e);
    } finally {
        await browser.close();
    }
}

main();

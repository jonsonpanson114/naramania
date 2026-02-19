
import { chromium } from 'playwright';
import { downloadAndExtractText } from './src/utils/pdf_utils';
import { extractBiddingInfoFromText } from './src/services/gemini_service';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function runResultsPilot() {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    console.log('--- Results Intelligence Pilot: Finding Real PDF ---');
    try {
        await page.goto('https://www.city.nara.lg.jp/site/nyusatu-keiyaku/', { waitUntil: 'domcontentloaded' });

        console.log('Clicking "開札結果"...');
        await page.getByRole('link', { name: '開札結果' }).first().click();
        await page.waitForLoadState('domcontentloaded');

        console.log('Selecting recent results list...');
        // Usually categories like "建設工事"
        const categoryLink = page.getByRole('link', { name: /工事/ }).first();
        if (await categoryLink.count() > 0) {
            await categoryLink.click();
            await page.waitForLoadState('domcontentloaded');

            console.log('Looking for latest PDF result document...');
            const pdfUrl = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                const pdf = links.find(a => a.href.endsWith('.pdf') && (a.innerText.includes('結果') || a.innerText.includes('開札')));
                return pdf ? (pdf as HTMLAnchorElement).href : null;
            });

            if (pdfUrl) {
                console.log(`Found PDF: ${pdfUrl}`);
                console.log('Downloading and Extracting Text...');
                const text = await downloadAndExtractText(pdfUrl);

                if (text) {
                    console.log('Analyzing with Gemini AI...');
                    const info = await extractBiddingInfoFromText(text);
                    console.log('--- Final Intelligence Result ---');
                    console.log(JSON.stringify(info, null, 2));
                } else {
                    console.error('Failed to extract text from PDF.');
                }
            } else {
                console.log('No result PDF found on the final list page.');
            }
        } else {
            console.log('Construction category link not found.');
        }
    } catch (e) {
        console.error('Pilot Error:', e);
    } finally {
        await browser.close();
    }
}

runResultsPilot();

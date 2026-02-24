import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium, Page } from 'playwright';
import AdmZip from 'adm-zip';
import pdf from 'pdf-parse';
import { extractBiddingInfoFromText } from './src/services/gemini_service';
import { BiddingItem } from './src/types/bidding';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RESULT_PATH = path.join(__dirname, 'scraper_result.json');
const BATCH_SIZE = 1; // Process one by one due to Playwright overhead
const MAX_CONSECUTIVE_ERRORS = 3;

async function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function extractTextFromZipBuffer(zipBuffer: Buffer): Promise<string> {
    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();

    let combinedText = '';

    for (const zipEntry of zipEntries) {
        if (!zipEntry.isDirectory && zipEntry.entryName.toLowerCase().endsWith('.pdf')) {
            console.log(`[ZIP] Found PDF: ${zipEntry.entryName}`);
            const pdfBuffer = zipEntry.getData();

            let fullText = '';
            if (pdf.PDFParse) {
                const parser = new pdf.PDFParse({ data: pdfBuffer });
                const textResult = await parser.getText();
                if (textResult && textResult.pages) {
                    fullText = textResult.pages.map((p: any) => p.text).join('\n\n');
                } else if (textResult && textResult.text) {
                    fullText = textResult.text;
                }
            } else {
                const data = await pdf(pdfBuffer);
                fullText = data.text;
            }
            combinedText += fullText + '\n\n';
        }
    }

    return combinedText.trim();
}

async function scrapeNaraPrefPdf(page: Page, item: BiddingItem): Promise<string | null> {
    console.log('[1] Accessing Nara Prefecture PPI system (Frame Initialization)...');
    await page.goto('http://www.ppi06.t-elbs.jp/DENCHO/PpiJGyomuStart.do?kinouid=GP5000_Top', { waitUntil: 'domcontentloaded' });

    // Allow frames to load
    await delay(3000);
    const gp10f = page.frames().find(f => f.url().includes('GP5000_10F'));
    const menuFrame = gp10f?.childFrames().find(f => f.url().includes('GP5000_Menu'));
    const fra1 = page.frame('fra_main1');

    if (!menuFrame || !fra1) {
        console.error('Failed to get required frames.');
        return null;
    }

    // Explicitly wait for the menu to be completely ready
    await menuFrame.waitForLoadState('load');

    console.log('[2] Navigating to Construction Results (入札結果)...');
    await Promise.all([
        fra1.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        menuFrame.evaluate((url: string) => (window as any).pf_VidDsp_btnReferenceClick(url), '/DENCHO/GP5515_1010?gyoshuKbnCd=00')
    ]);

    await delay(1000);

    console.log(`[3] Performing wildcard search to find: ${item.title}`);
    await fra1.selectOption('select[name="keisaiNen"]', '2025').catch(() => { });
    await Promise.all([
        fra1.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        fra1.evaluate(() => {
            const topW = window.top as any;
            if (topW?.fra_hidden) topW.fra_hidden.submit_flag = 0;
            (window as any).fnc_btnSearch_Clicked();
        })
    ]);

    await delay(1000);

    // Search results are rendered inside fra1 frame
    const rows = fra1.locator('table tr');
    const rowCount = await rows.count();
    let targetRowIndex = -1;

    for (let i = 0; i < rowCount; i++) {
        const rowText = await rows.nth(i).innerText();
        const rowTitle = rowText.trim().split('\n')[0];
        // Since titles might be truncated in e-BISC, check if the row contains part of the title or vice-versa
        // Prevent false positives on empty strings
        if (rowTitle.length > 5 && (rowText.includes(item.title) || item.title.includes(rowTitle))) {
            targetRowIndex = i;
            break;
        }
    }

    let displayBtn = rows.nth(targetRowIndex).locator('input[value="表示"]');

    if (targetRowIndex === -1 || await displayBtn.count() === 0) {
        console.warn(`Target row invalid. Forcing the FIRST available '表示' button for ZIP testing.`);
        const allButtons = fra1.locator('input[value="表示"]');
        if (await allButtons.count() === 0) {
            console.error('No display button found anywhere on page.');
            return null;
        }
        displayBtn = allButtons.first();
    }

    console.log(`Opening popup...`);

    // We override window.open so we can intercept the popup URL if needed,
    // or we just use Playwright's wait for popup event.
    const [popup] = await Promise.all([
        page.waitForEvent('popup'),
        displayBtn.first().click()
    ]);

    await popup.waitForLoadState('domcontentloaded');

    // Find "一括ダウンロード"
    console.log('Locating download button in popup...');
    const downloadBtn = popup.locator('input[value="一括ダウンロード"]');
    if (await downloadBtn.count() === 0) {
        console.error('No download button in popup.');
        await popup.close();
        return null;
    }

    console.log('Intercepting download stream...');
    const [download] = await Promise.all([
        popup.waitForEvent('download'),
        downloadBtn.first().click()
    ]);

    const stream = await download.createReadStream();
    if (!stream) {
        console.error('No stream created.');
        await popup.close();
        return null;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const zipBuffer = Buffer.concat(chunks);
    console.log(`Downloaded ZIP buffer: ${zipBuffer.length} bytes.`);

    await popup.close();

    // Extract text from ZIP
    return await extractTextFromZipBuffer(zipBuffer);
}

async function main() {
    console.log('--- Starting Nara Pref PDF Intelligence Batch Processor ---');

    if (!fs.existsSync(RESULT_PATH)) {
        console.error('scraper_result.json not found!');
        return;
    }

    const rawData = fs.readFileSync(RESULT_PATH, 'utf-8');
    const items: BiddingItem[] = JSON.parse(rawData);

    // Target specific Nara Pref items
    const targetItems = items.filter(i => i.id === 'nara-pref-test' && !i.isIntelligenceExtracted);
    console.log(`Found ${targetItems.length} Nara Prefecture items requiring intelligence extraction.`);

    // Just process 2 items for now to prove concept
    const batch = targetItems.slice(0, 2);
    if (batch.length === 0) return;

    console.log('Launching browser...');
    const browser = await chromium.launch({ headless: true });

    let consecutiveErrors = 0;

    for (const item of batch) {
        console.log(`\nProcessing: ${item.id} - ${item.title}`);

        try {
            const context = await browser.newContext();

            // Set charset explicitly to solve EFFTIS Shift-JIS mojibake in navigation (though this is search, still good)
            await context.route('**/*', async (route) => {
                const response = await route.fetch();
                let contentType = response.headers()['content-type'] || '';
                if (contentType.toLowerCase().includes('shift_jis')) {
                    contentType = contentType.replace(/shift_jis/i, 'utf-8');
                    const headers = { ...response.headers(), 'content-type': contentType };
                    await route.fulfill({ response, headers });
                } else {
                    await route.fallback();
                }
            });

            const page = await context.newPage();

            let pdfText = await scrapeNaraPrefPdf(page, item);

            await context.close();

            if (!pdfText || pdfText.length < 50) {
                console.warn(`Failed to extract meaningful text for ${item.id}. Marking as empty.`);
                item.description = 'PDF extraction failed or empty ZIP.';
                item.isIntelligenceExtracted = true;
                consecutiveErrors++;
            } else {
                console.log(`Extracted ${pdfText.length} chars from ZIP. Sending to Gemini...`);
                const intelligence = await extractBiddingInfoFromText(pdfText);
                item.isIntelligenceExtracted = true;
                if (intelligence) {
                    item.estimatedPrice = intelligence.estimatedPrice || undefined;
                    item.winningContractor = intelligence.winningContractor || undefined;
                    item.designFirm = intelligence.designFirm || undefined;
                    item.constructionPeriod = intelligence.constructionPeriod || undefined;
                    item.description = intelligence.description || undefined;
                    console.log('Success!', item.estimatedPrice || 'No price found.');
                    consecutiveErrors = 0; // reset
                } else {
                    console.log('Gemini returned null. Marking as empty.');
                    item.description = undefined;
                    consecutiveErrors++;
                }
            }

            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                console.error('Too many consecutive errors. Stopping batch.');
                break;
            }

            console.log('Waiting 5 seconds before next item...');
            await delay(5000);

        } catch (e: any) {
            console.error(`Error processing ${item.id}:`, e.message || e);
            consecutiveErrors++;
        }
    }

    await browser.close();

    // Save back to JSON
    console.log('\nSaving updated data to scraper_result.json...');
    fs.writeFileSync(RESULT_PATH, JSON.stringify(items, null, 2), 'utf-8');
    console.log('Done!');
}

main();

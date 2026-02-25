import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium, Page } from 'playwright';
import AdmZip from 'adm-zip';
import * as _pdf from 'pdf-parse';
const pdf = (_pdf as any).default || _pdf;
import { extractBiddingInfoFromText } from './src/services/gemini_service';
import { BiddingItem, BiddingType } from './src/types/bidding';

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

            try {
                const data = await pdf(pdfBuffer);
                combinedText += data.text + '\n\n';
            } catch (e) {
                console.error(`Error parsing PDF ${zipEntry.entryName}:`, e);
            }
        }
    }

    return combinedText.trim();
}

async function scrapeNaraPrefPdf(page: Page, item: BiddingItem): Promise<string | null> {
    console.log('[1] Accessing Nara Prefecture PPI system (Frame Initialization)...');
    await page.goto('http://www.ppi06.t-elbs.jp/DENCHO/PpiJGyomuStart.do?kinouid=GP5000_Top', { waitUntil: 'domcontentloaded' });

    await delay(3000);
    const gp10f = page.frames().find(f => f.url().includes('GP5000_10F'));
    const menuFrame = gp10f?.childFrames().find(f => f.url().includes('GP5000_Menu'));
    const fra1 = page.frame('fra_main1');

    if (!menuFrame || !fra1) {
        console.error('Failed to get required frames.');
        return null;
    }

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
        fra1.locator('input[value="検索"]').click()
    ]);

    await delay(1000);

    const rows = fra1.locator('table tr');
    const rowCount = await rows.count();
    let targetRowIndex = -1;

    for (let i = 0; i < rowCount; i++) {
        const rowText = await rows.nth(i).innerText();
        const rowTitle = rowText.trim().split('\n')[0];
        if (rowTitle.length > 5 && (rowText.includes(item.title) || item.title.includes(rowTitle))) {
            targetRowIndex = i;
            break;
        }
    }

    let displayBtn = rows.nth(targetRowIndex).locator('input[value="表示"]');

    if (targetRowIndex === -1 || await displayBtn.count() === 0) {
        console.warn(`Target row invalid. Forcing the FIRST available '表示' button for ZIP testing.`);
        const allButtons = fra1.locator('input[value="表示"]');
        if (await allButtons.count() === 0) return null;
        displayBtn = allButtons.first();
    }

    console.log(`Opening popup...`);

    const [popup] = await Promise.all([
        page.waitForEvent('popup'),
        displayBtn.first().click()
    ]);

    await popup.waitForLoadState('domcontentloaded');

    const downloadBtn = popup.locator('input[value="一括ダウンロード"]');
    if (await downloadBtn.count() === 0) {
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
        await popup.close();
        return null;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const zipBuffer = Buffer.concat(chunks);
    await popup.close();

    return await extractTextFromZipBuffer(zipBuffer);
}

async function getNaraPref2025List(page: Page): Promise<BiddingItem[]> {
    console.log('[List] Searching Nara Pref 2025 list...');
    await page.goto('http://www.ppi06.t-elbs.jp/DENCHO/PpiJGyomuStart.do?kinouid=GP5000_Top', { waitUntil: 'domcontentloaded' });
    await delay(5000);

    const fraL = page.frames().find(f => f.name() === 'fra_mainL');
    if (!fraL) {
        console.error('Initial fra_mainL not found.');
        return [];
    }

    const p5515 = fraL.locator('#P5515');
    await p5515.waitFor({ state: 'visible', timeout: 10000 });

    await p5515.click();
    await delay(5000);

    // Look for the frame containing the search form
    console.log('[List] Discovering search form frame...');
    let searchFrame = page.frames().find(f => f.name() === 'fra_mainR');
    if (!searchFrame) {
        searchFrame = page.frames().find(f => f.url().includes('GP5515_1010'));
    }

    if (!searchFrame) {
        console.error('Failed to discover search form frame.');
        return [];
    }

    console.log(`[List] Filling search criteria in frame: ${searchFrame.name() || 'unnamed'}`);
    await searchFrame.selectOption('select[name="keisaiNen"]', '2025').catch(() => { });
    await searchFrame.selectOption('select[name="koshuCd"]', '200').catch(() => { });     // 建築一式 (Architecture)
    await searchFrame.selectOption('select[name="pageSize"]', '500').catch(() => { });    // Max 500 per page

    await searchFrame.locator('#btnSearch').click();
    console.log('[List] Form submitted. Waiting for results table...');
    await delay(10000); // 10s delay to allow e-BISC to process the search and reload the frame

    // e-BISC reloads fra_mainR into GP5515_1020 for the results list
    const resultsFrame = page.frames().find(f => f.url().includes('1020') || f.name() === 'fra_mainR') || searchFrame;

    const rows = resultsFrame.locator('table tr');
    const count = await rows.count();
    console.log(`[List] Found ${count} rows on the results page.`);
    const items: BiddingItem[] = [];

    // The first rows are usually headers
    for (let i = 1; i < count; i++) {
        const rowText = await rows.nth(i).innerText();
        const lines = rowText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        // We expect at least 6 lines for a valid data row
        if (lines.length < 6) continue;

        // Title is usually the second to last line
        let title = lines[lines.length - 2];

        // Exclude Cancelled projects
        if (title.includes('【中止】')) continue;

        // Date is the 3rd to last line, e.g. "R07.09.05 10:30"
        let rawDate = lines[lines.length - 3];
        let announcementDate = '2025-01-01'; // Fallback

        const rMatch = rawDate.match(/R(\d+)\.(\d+)\.(\d+)/);
        if (rMatch) {
            const reiwaYear = parseInt(rMatch[1], 10);
            const gregorian = 2018 + reiwaYear;
            const month = rMatch[2].padStart(2, '0');
            const day = rMatch[3].padStart(2, '0');
            announcementDate = `${gregorian}-${month}-${day}`;
        }

        if (title.length > 5 && !items.find(it => it.title === title)) {
            items.push({
                id: `nara-pref-2025-${i}`,
                municipality: '奈良県',
                title: title,
                type: '建築', // Pre-filtered by koshuCd='200'
                announcementDate: announcementDate,
                link: 'e-BISC',
                status: '落札',
                isIntelligenceExtracted: false
            });
        }
    }
    return items;
}

async function main() {
    console.log('--- Starting Nara Pref Real Data Pull (2025) ---');

    console.log('Launching browser...');
    const browser = await chromium.launch({ headless: true });
    try {
        const listPage = await browser.newPage();
        const newList = await getNaraPref2025List(listPage);
        await listPage.close();

        console.log(`Discovered ${newList.length} potential 2025 architecture projects.`);

        let existingItems: BiddingItem[] = [];
        if (fs.existsSync(RESULT_PATH)) {
            existingItems = JSON.parse(fs.readFileSync(RESULT_PATH, 'utf-8'));
        }

        const itemsToProcess: BiddingItem[] = [];
        for (const it of newList) {
            const index = existingItems.findIndex(ex => ex.title === it.title);
            if (index === -1) {
                itemsToProcess.push(it);
                existingItems.push(it);
            } else if (!existingItems[index].isIntelligenceExtracted && existingItems[index].municipality === '奈良県') {
                itemsToProcess.push(existingItems[index]);
            }
        }

        console.log(`Processing batch of ${Math.min(itemsToProcess.length, 5)} projects...`);

        let consecutiveErrors = 0;
        const currentBatch = itemsToProcess.slice(0, 5);

        for (const item of currentBatch) {
            console.log(`\nProcessing: ${item.id} - ${item.title}`);

            try {
                const context = await browser.newContext();
                await context.route('**/*', async (route) => {
                    try {
                        const response = await route.fetch();
                        let contentType = response.headers()['content-type'] || '';
                        if (contentType.toLowerCase().includes('shift_jis')) {
                            contentType = contentType.replace(/shift_jis/i, 'utf-8');
                            const headers = { ...response.headers(), 'content-type': contentType };
                            await route.fulfill({ response, headers });
                        } else {
                            await route.fallback();
                        }
                    } catch (e) {
                        await route.abort().catch(() => { });
                    }
                });

                const page = await context.newPage();
                const pdfText = await scrapeNaraPrefPdf(page, item);
                await context.close();

                if (!pdfText || pdfText.length < 50) {
                    console.warn(`Failed text extraction for ${item.id}.`);
                    item.description = 'PDF extraction failed or empty.';
                    item.isIntelligenceExtracted = true;
                    consecutiveErrors++;
                } else {
                    console.log(`Extracted ${pdfText.length} chars. Sending to Gemini...`);
                    const intelligence = await extractBiddingInfoFromText(pdfText);
                    item.isIntelligenceExtracted = true;
                    if (intelligence) {
                        item.estimatedPrice = intelligence.estimatedPrice || undefined;
                        item.winningContractor = intelligence.winningContractor || undefined;
                        item.designFirm = intelligence.designFirm || undefined;
                        item.constructionPeriod = intelligence.constructionPeriod || undefined;
                        item.description = intelligence.description || undefined;
                        console.log('Success!', item.estimatedPrice || 'No price found.');
                        consecutiveErrors = 0;
                    } else {
                        console.log('Gemini returned null.');
                        consecutiveErrors++;
                    }
                }

                if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) break;
                await delay(5000);

            } catch (e: any) {
                console.error(`Error:`, e.message || e);
                consecutiveErrors++;
            }
        }

        console.log('\nSaving updated data...');
        fs.writeFileSync(RESULT_PATH, JSON.stringify(existingItems, null, 2), 'utf-8');
        console.log('Done!');

    } finally {
        await browser.close();
    }
}

main().catch(console.error);

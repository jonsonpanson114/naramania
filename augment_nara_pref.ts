import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium, Page } from 'playwright';
import AdmZip from 'adm-zip';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
import { extractBiddingInfoFromText } from './src/services/gemini_service';
import { BiddingItem, BiddingType } from './src/types/bidding';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RESULT_PATH = path.join(__dirname, 'scraper_result.json');
const BATCH_SIZE = 1; // Process one by one due to Playwright overhead
const MAX_CONSECUTIVE_ERRORS = 3;

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function extractTextFromZipBuffer(zipBuffer: Buffer): Promise<string> {
    try {
        const zip = new AdmZip(zipBuffer);
        const zipEntries = zip.getEntries();
        let textOut = '';

        console.log(`[ZIP] Downloaded ZIP with ${zipEntries.length} entries.`);
        for (const entry of zipEntries) {
            console.log(`[ZIP Entry] ${entry.entryName}`);
            if (!entry.isDirectory) {
                const entryNameLower = entry.entryName.toLowerCase();
                if (entryNameLower.endsWith('.pdf')) {
                    const pdfData = entry.getData();
                    try {
                        if (pdf.PDFParse) {
                            const parser = new pdf.PDFParse({ data: pdfData });
                            const textResult = await parser.getText();
                            if (textResult && textResult.pages) {
                                textOut += textResult.pages.map((p: any) => p.text).join('\n') + '\n';
                            } else if (textResult && textResult.text) {
                                textOut += textResult.text + '\n';
                            }
                        } else {
                            const data = await (pdf as any)(pdfData);
                            textOut += data.text + '\n';
                        }
                    } catch (e) {
                        console.error(`Error parsing PDF ${entry.entryName}:`, e);
                    }
                } else if (entryNameLower.endsWith('.zip')) {
                    console.log(`[ZIP Entry] Found nested ZIP: ${entry.entryName}, extracting recursively...`);
                    const nestedZipData = entry.getData();
                    textOut += await extractTextFromZipBuffer(nestedZipData);
                }
            }
        }
        return textOut.trim();
    } catch (e) {
        console.log(`[ZIP Error] Failed to read ZIP buffer: ${e}`);
        return '';
    }
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

    console.log(`[3] Performing search to find: ${item.title}`);

    await fra1.selectOption('select[name="keisaiNen"]', '2025').catch(() => { });
    const koshuCd = item.type === '委託' || item.type === 'コンサル' ? '300000' : '200';
    await fra1.selectOption('select[name="koshuCd"]', koshuCd).catch(() => { });
    await fra1.selectOption('select[name="pageSize"]', '500').catch(() => { });

    await Promise.all([
        fra1.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        fra1.locator('input[value="検索"]').click()
    ]);

    await delay(2000);

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
        console.error(`Target row NOT FOUND for: ${item.title}`);
        return null;
    }

    console.log(`Opening popup...`);

    const [popup] = await Promise.all([
        page.waitForEvent('popup'),
        displayBtn.first().click()
    ]);

    await popup.waitForLoadState('domcontentloaded');

    popup.on('dialog', async dialog => {
        console.log(`[Popup] Auto-accepting dialog: ${dialog.message()}`);
        await dialog.accept();
    });

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

async function getNaraPref2025CategoryList(page: Page, menuId: string, koshuCd: string, categoryName: string): Promise<BiddingItem[]> {
    console.log(`[List] Searching Nara Pref 2025 list for ${categoryName}...`);
    await page.goto('http://www.ppi06.t-elbs.jp/DENCHO/PpiJGyomuStart.do?kinouid=GP5000_Top', { waitUntil: 'domcontentloaded' });
    await delay(5000);

    const fraL = page.frames().find(f => f.name() === 'fra_mainL');
    if (!fraL) {
        console.error('Initial fra_mainL not found.');
        return [];
    }

    const pMenu = fraL.locator(`#${menuId}`);
    await pMenu.waitFor({ state: 'visible', timeout: 10000 });

    await pMenu.click();
    await delay(5000);

    // Look for the frame containing the search form
    console.log('[List] Discovering search form frame...');
    let searchFrame = page.frames().find(f => f.name() === 'fra_mainR' || f.url().includes('1010'));
    if (!searchFrame) {
        await page.waitForTimeout(5000);
        searchFrame = page.frames().find(f => f.name() === 'fra_mainR' || f.url().includes('1010'));
    }

    if (!searchFrame) {
        console.error('Failed to discover search form frame.');
        return [];
    }

    console.log(`[List] Filling search criteria in frame: ${searchFrame.name() || 'unnamed'}`);
    await searchFrame.selectOption('select[name="keisaiNen"]', '2025').catch(() => { });
    await searchFrame.selectOption('select[name="koshuCd"]', koshuCd).catch(() => { });     // 建築系
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
                type: categoryName === '建築' ? '建築' : 'コンサル',
                announcementDate: announcementDate,
                link: 'e-BISC',
                status: '落札',
                isIntelligenceExtracted: false
            });
        }
    }
    return items;
}

async function getNaraPref2025List(page: Page): Promise<BiddingItem[]> {
    const listConstruction = await getNaraPref2025CategoryList(page, 'P5515', '200', '建築');
    const listConsulting = await getNaraPref2025CategoryList(page, 'P6015', '300000', 'コンサル');
    return [...listConstruction, ...listConsulting];
}

async function main() {
    console.log('--- Starting Nara Pref Real Data Pull (2025) ---');

    console.log('Launching browser...');
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();

        const newList = await getNaraPref2025List(page);

        console.log(`Discovered ${newList.length} potential 2025 projects across both categories.`);

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
        const currentBatch = itemsToProcess.slice(0, 10);

        for (const item of currentBatch) {
            console.log(`\nProcessing: ${item.id} - ${item.title}`);

            try {
                const context = await browser.newContext();
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

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadAndExtractText } from '../src/utils/pdf_utils.ts';
import { extractBiddingInfoFromText } from '../src/services/gemini_service.ts';
import type { BiddingItem } from '../src/types/bidding.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RESULT_PATH = path.join(process.cwd(), 'scraper_result.json');
const BATCH_SIZE = 100; // Larger batch now that we save on each step

async function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('--- Starting PDF Intelligence Batch Processor (Gemini Edition) ---');

    if (!fs.existsSync(RESULT_PATH)) {
        console.error('scraper_result.json not found!');
        return;
    }

    const rawData = fs.readFileSync(RESULT_PATH, 'utf-8');
    const items: BiddingItem[] = JSON.parse(rawData);

    // Find items that HAVE a pdfUrl but DO NOT have isIntelligenceExtracted flag yet
    // OR have winningContractor from scraper but not yet processed by Gemini
    const targetItems = items.filter(i => i.pdfUrl && !i.isIntelligenceExtracted);
    console.log(`Found ${targetItems.length} items requiring intelligence extraction.`);

    if (targetItems.length === 0) {
        console.log('All PDF items have been processed! Exiting.');
        return;
    }

    const batch = targetItems.slice(0, BATCH_SIZE);
    console.log(`Processing batch of ${batch.length} items...`);

    let processedCount = 0;

    for (const item of batch) {
        console.log(`\n[${processedCount + 1}/${batch.length}] Processing: ${item.id} - ${item.title}`);
        try {
            console.log(`Downloading PDF: ${item.pdfUrl}`);
            const pdfData = await downloadAndExtractText(item.pdfUrl!);

            if (!pdfData || pdfData.text.length < 50) {
                console.warn(`Failed to extract meaningful text for ${item.id}. Marking as empty.`);
                item.description = 'PDF parse failed or empty.';
                item.isIntelligenceExtracted = true;
                item.extractionSource = 'scraper'; // Fallback to scraper info if PDF fails
            } else {
                console.log(`Extracted ${pdfData.text.length} chars. Sending to Gemini...`);
                const intelligence = await extractBiddingInfoFromText(pdfData.text);
                item.isIntelligenceExtracted = true;
                item.extractionSource = 'gemini_3.1';

                if (intelligence) {
                    item.estimatedPrice = intelligence.estimatedPrice || item.estimatedPrice;
                    item.winningContractor = intelligence.winningContractor || item.winningContractor;
                    item.designFirm = intelligence.designFirm || item.designFirm;
                    item.constructionPeriod = intelligence.constructionPeriod || item.constructionPeriod;
                    item.description = intelligence.description || item.description;
                    console.log(`Success! ${item.winningContractor || 'No contractor found.'}`);
                } else {
                    console.log('Gemini returned null. Marking as empty.');
                }
            }

            processedCount++;

            // Save after each item to ensure progress isn't lost
            fs.writeFileSync(RESULT_PATH, JSON.stringify(items, null, 2));
            console.log('Waiting 5 seconds before next item...');
            await delay(5000); // 5 second delay between items

        } catch (e: any) {
            console.error(`Error processing ${item.id}:`, e.message || e);
            // Even if an error occurs, we still save the current state to prevent data loss
            fs.writeFileSync(RESULT_PATH, JSON.stringify(items, null, 2));
            console.log('Waiting 5 seconds before next item (after error)...');
            await delay(5000); // Still delay to avoid hammering on errors
        }
    }

    // Save back to JSON
    console.log('\nSaving updated data to scraper_result.json...');
    fs.writeFileSync(RESULT_PATH, JSON.stringify(items, null, 2), 'utf-8');
    console.log('Done!');
}

main();

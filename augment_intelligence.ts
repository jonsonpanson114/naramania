import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadAndExtractText } from './src/utils/pdf_utils';
import { extractBiddingInfoFromText } from './src/services/gemini_service';
import { BiddingItem } from './src/types/bidding';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RESULT_PATH = path.join(__dirname, 'scraper_result.json');
const BATCH_SIZE = 5; // Process in small batches to avoid rate limits

async function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('--- Starting PDF Intelligence Batch Processor ---');

    if (!fs.existsSync(RESULT_PATH)) {
        console.error('scraper_result.json not found!');
        return;
    }

    const rawData = fs.readFileSync(RESULT_PATH, 'utf-8');
    const items: BiddingItem[] = JSON.parse(rawData);

    // Find items that HAVE a pdfUrl but DO NOT have isIntelligenceExtracted flag yet
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
            } else {
                console.log(`Extracted ${pdfData.text.length} chars. Sending to Gemini...`);
                const intelligence = await extractBiddingInfoFromText(pdfData.text);
                item.isIntelligenceExtracted = true;
                if (intelligence) {
                    item.estimatedPrice = intelligence.estimatedPrice || undefined;
                    item.winningContractor = intelligence.winningContractor || undefined;
                    item.designFirm = intelligence.designFirm || undefined;
                    item.constructionPeriod = intelligence.constructionPeriod || undefined;
                    item.description = intelligence.description || undefined;
                    console.log('Success!', item.estimatedPrice || 'No price found.');
                } else {
                    console.log('Gemini returned null. Marking as empty.');
                    item.description = undefined;
                }
            }

            processedCount++;

            // Respectful delay between Gemini API calls
            if (processedCount < batch.length) {
                console.log('Waiting 5 seconds before next item...');
                await delay(5000);
            }

        } catch (e: any) {
            console.error(`Error processing ${item.id}:`, e.message || e);
        }
    }

    // Save back to JSON
    console.log('\nSaving updated data to scraper_result.json...');
    fs.writeFileSync(RESULT_PATH, JSON.stringify(items, null, 2), 'utf-8');
    console.log('Done!');
}

main();

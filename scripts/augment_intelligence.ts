
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadPDFBuffer } from '../src/utils/pdf_utils.ts';
import { extractBiddingInfoFromPDF, extractBiddingInfoFromText } from '../src/services/gemini_service.ts';
import type { BiddingItem } from '../src/types/bidding.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RESULT_PATH = path.join(process.cwd(), 'scraper_result.json');
const BATCH_SIZE = 50;

async function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('--- 🚀 Gemini 3.1 State-of-the-Art Processor ---');
    console.log('[Native PDF + JSON Schema Enforcement]');

    if (!fs.existsSync(RESULT_PATH)) {
        console.error('scraper_result.json not found!');
        return;
    }

    const rawData = fs.readFileSync(RESULT_PATH, 'utf-8');
    const items: BiddingItem[] = JSON.parse(rawData);

    // Target items: 
    // 1. PDF exists but not processed by Gemini 3.1 yet
    // 2. Processed but missing tags
    const targetItems = items.filter(i => 
        (i.pdfUrl && i.extractionSource !== 'gemini_3.1') || 
        (i.description && (!i.tags || i.tags.length === 0))
    );

    console.log(`Found ${targetItems.length} items requiring intelligence or tagging.`);

    if (targetItems.length === 0) {
        console.log('All items are up to date! Exiting.');
        return;
    }

    const batch = targetItems.slice(0, BATCH_SIZE);
    console.log(`Processing batch of ${batch.length} items...`);

    for (let i = 0; i < batch.length; i++) {
        const item = batch[i];
        console.log(`\n[${i + 1}/${batch.length}] Processing: ${item.id} - ${item.title}`);
        
        try {
            if (item.pdfUrl && item.extractionSource !== 'gemini_3.1') {
                console.log(`⚡ Using Native PDF Multimodal API: ${item.pdfUrl}`);
                const pdfBuffer = await downloadPDFBuffer(item.pdfUrl);
                if (pdfBuffer) {
                    const info = await extractBiddingInfoFromPDF(pdfBuffer);
                    if (info) {
                        item.estimatedPrice = info.estimatedPrice || item.estimatedPrice;
                        item.winningContractor = info.winningContractor || item.winningContractor;
                        item.designFirm = info.designFirm || item.designFirm;
                        item.constructionPeriod = info.constructionPeriod || item.constructionPeriod;
                        item.description = info.description || item.description;
                        item.tags = info.tags || item.tags;
                        item.isIntelligenceExtracted = true;
                        item.extractionSource = 'gemini_3.1';
                        console.log(`✅ Extraction Success! Tags: ${item.tags?.join(', ')}`);
                    }
                }
            } else if (item.description && (!item.tags || item.tags.length === 0)) {
                console.log(`🏷️  Generating Tags from existing text...`);
                const info = await extractBiddingInfoFromText(item.description);
                if (info && info.tags) {
                    item.tags = info.tags;
                    console.log(`✅ Tagging Success! Tags: ${item.tags.join(', ')}`);
                }
            }

            // Save frequently
            if (i % 5 === 0) fs.writeFileSync(RESULT_PATH, JSON.stringify(items, null, 2));

            await delay(2000); // Respect rate limits

        } catch (e: any) {
            console.error(`❌ Error processing ${item.id}:`, e.message || e);
        }
    }

    fs.writeFileSync(RESULT_PATH, JSON.stringify(items, null, 2), 'utf-8');
    console.log('\n--- Batch Complete! ---');
}

main();

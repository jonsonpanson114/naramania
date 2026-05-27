import fs from 'fs';
import { downloadPDFBuffer } from '../src/utils/pdf_utils';
import { extractBiddingInfoFromPDF, extractBiddingInfoFromText } from '../src/services/gemini_service';
import { extractPdfText } from '../src/scrapers/common/pdf_text';
import { buildIntelligenceSummary, readQualitySummary, writeQualitySummary } from '../src/lib/quality_summary';
import type { BiddingItem } from '../src/types/bidding';

const RESULT_PATH = 'scraper_result.json';
const BATCH_SIZE = 50;

async function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function supportsPdfExtraction(item: BiddingItem): boolean {
    return Boolean(item.pdfUrl && /\.pdf(?:$|\?)/i.test(item.pdfUrl));
}

function hasSummary(item: BiddingItem): boolean {
    return Boolean(item.description?.trim());
}

async function main() {
    console.log('--- 🚀 Gemini Intelligence Processor ---');
    console.log('[Native PDF + JSON Schema Enforcement]');

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('GOOGLE_GENERATIVE_AI_API_KEY is not set. Skipping AI augmentation.');
        return;
    }

    if (!fs.existsSync(RESULT_PATH)) {
        console.error('scraper_result.json not found!');
        return;
    }

    const rawData = fs.readFileSync(RESULT_PATH, 'utf-8');
    const items: BiddingItem[] = JSON.parse(rawData);

    // Target items:
    // 1. PDF exists, can be parsed, and AI summary has not been generated yet
    // 2. Existing summary exists but tags are still missing
    const targetItems = items.filter((item) =>
        (supportsPdfExtraction(item) && !hasSummary(item)) ||
        (hasSummary(item) && (!item.tags || item.tags.length === 0))
    );

    console.log(`Found ${targetItems.length} items requiring intelligence or tagging.`);

    if (targetItems.length === 0) {
        console.log('All items are up to date! Exiting.');
        return;
    }

    const batch = targetItems.slice(0, BATCH_SIZE);
    console.log(`Processing batch of ${batch.length} items...`);
    let augmentedCount = 0;
    let taggedCount = 0;
    let failedCount = 0;
    const augmentedAt = new Date().toISOString();

    for (let i = 0; i < batch.length; i++) {
        const item = batch[i];
        console.log(`\n[${i + 1}/${batch.length}] Processing: ${item.id} - ${item.title}`);
        
        try {
            if (supportsPdfExtraction(item) && !hasSummary(item)) {
                console.log(`⚡ Using Native PDF Multimodal API: ${item.pdfUrl}`);
                const pdfBuffer = await downloadPDFBuffer(item.pdfUrl!);
                if (pdfBuffer) {
                    let info = await extractBiddingInfoFromPDF(pdfBuffer);

                    if (!info?.description) {
                        console.log('↩ Native PDF extraction failed or returned no summary. Falling back to text extraction...');
                        const pdfText = await extractPdfText(item.pdfUrl!, 8);
                        if (pdfText) {
                            info = await extractBiddingInfoFromText(pdfText);
                        }
                    }

                    if (info) {
                        item.estimatedPrice = info.estimatedPrice || item.estimatedPrice;
                        item.winningContractor = info.winningContractor || item.winningContractor;
                        item.designFirm = info.designFirm || item.designFirm;
                        item.constructionPeriod = info.constructionPeriod || item.constructionPeriod;
                        item.description = info.description || item.description;
                        item.tags = info.tags || item.tags;
                        if (info.description?.trim()) {
                            item.isIntelligenceExtracted = true;
                            item.extractionSource = 'gemini';
                            augmentedCount++;
                        }
                        if (info.tags?.length) taggedCount++;
                        console.log(`✅ Extraction Success! Tags: ${item.tags?.join(', ')}`);
                    } else {
                        failedCount++;
                        console.log('⚠ Intelligence extraction returned no result.');
                    }
                } else {
                    failedCount++;
                }
            } else if (hasSummary(item) && (!item.tags || item.tags.length === 0)) {
                console.log(`🏷️  Generating Tags from existing text...`);
                const info = await extractBiddingInfoFromText(item.description!);
                if (info && info.tags) {
                    item.tags = info.tags;
                    taggedCount++;
                    console.log(`✅ Tagging Success! Tags: ${item.tags.join(', ')}`);
                } else {
                    failedCount++;
                }
            }

            // Save frequently
            if (i % 5 === 0) fs.writeFileSync(RESULT_PATH, JSON.stringify(items, null, 2));

            await delay(2000); // Respect rate limits

        } catch (e: unknown) {
            failedCount++;
            console.error(`❌ Error processing ${item.id}:`, e instanceof Error ? e.message : String(e));
        }
    }

    fs.writeFileSync(RESULT_PATH, JSON.stringify(items, null, 2), 'utf-8');
    const existingQuality = readQualitySummary();
    writeQualitySummary({
        generatedAt: existingQuality?.generatedAt || augmentedAt,
        source: existingQuality?.source || 'augment_intelligence',
        keptCount: existingQuality?.keptCount ?? items.length,
        municipalityCount: existingQuality?.municipalityCount ?? new Set(items.map((item) => item.municipality)).size,
        oldestAnnouncementDate: existingQuality?.oldestAnnouncementDate ?? null,
        latestAnnouncementDate: existingQuality?.latestAnnouncementDate ?? null,
        ...(existingQuality?.scrapedCount !== undefined ? { scrapedCount: existingQuality.scrapedCount } : {}),
        ...(existingQuality?.rejectedCount !== undefined ? { rejectedCount: existingQuality.rejectedCount } : {}),
        ...(existingQuality?.originalCount !== undefined ? { originalCount: existingQuality.originalCount } : {}),
        ...(existingQuality?.removedCount !== undefined ? { removedCount: existingQuality.removedCount } : {}),
        ...(existingQuality?.municipalityAudit ? { municipalityAudit: existingQuality.municipalityAudit } : {}),
        ...(existingQuality?.dateAudit ? { dateAudit: existingQuality.dateAudit } : {}),
        intelligence: buildIntelligenceSummary(items, augmentedAt),
    });

    console.log(`\nAI summaries added: ${augmentedCount}`);
    console.log(`Tags added: ${taggedCount}`);
    console.log(`Failures: ${failedCount}`);
    console.log('\n--- Batch Complete! ---');
}

main();

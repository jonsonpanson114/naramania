import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { downloadAndExtractText } from './src/utils/pdf_utils';
import { extractBiddingInfoFromText } from './src/services/gemini_service';

async function main() {
    // A live Kashihara City PDF URL from the scrape
    const testUrl = 'https://www.city.kashihara.nara.jp/material/files/group/20/5072001304.pdf';
    console.log(`[1] Downloading & Extracting Text from ${testUrl}...`);

    const pdfData = await downloadAndExtractText(testUrl);

    if (!pdfData) {
        console.error("Failed to extract PDF text.");
        return;
    }

    console.log(`[2] Extracted ${pdfData.numpages} pages of text (${pdfData.text.length} characters).`);
    console.log(`[3] Sending to Gemini for Intelligence Extraction...`);

    const intelligence = await extractBiddingInfoFromText(pdfData.text);

    console.log("\n=== 💎 EXTRACTED INTELLIGENCE 💎 ===");
    console.log(JSON.stringify(intelligence, null, 2));
    console.log("=====================================\n");
}

main();

import 'dotenv/config';
import { downloadAndExtractText } from './src/utils/pdf_utils';
import { extractBiddingInfoFromText } from './src/services/gemini_service';

async function main() {
    // A live Nara City PDF URL (e.g., from scraping results)
    const testUrl = 'https://www.city.nara.nara.jp/uploaded/attachment/186595.pdf';
    console.log(`[1] Downloading & Extracting Text from ${testUrl}...`);

    const pdfData = await downloadAndExtractText(testUrl);

    if (!pdfData) {
        console.error('Failed to extract text from PDF.');
        return;
    }

    console.log(`[2] Extracted ${pdfData.numpages} pages of text (${pdfData.text.length} characters).`);
    console.log('[3] Sending to Gemini for Intelligence Extraction...');

    const intelligence = await extractBiddingInfoFromText(pdfData.text);

    console.log('\n=== 💎 NARA CITY EXTRACTED INTELLIGENCE 💎 ===');
    console.log(JSON.stringify(intelligence, null, 2));
    console.log('=============================================\n');
}

main();

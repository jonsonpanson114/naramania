
import { downloadAndExtractText } from './src/utils/pdf_utils';
import { extractBiddingInfoFromText } from './src/services/gemini_service';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function verifyGemini() {
    // A reliable public PDF for testing the extractor + AI logic
    const fallbackUrl = 'https://www.soumu.go.jp/main_content/000962321.pdf'; // Example from Soumu (General)

    console.log('--- Verifying Gemini with Fallback PDF ---');
    const pdfData = await downloadAndExtractText(fallbackUrl);

    if (pdfData) {
        console.log('PDF Extracted. Sending to Gemini...');
        const info = await extractBiddingInfoFromText(pdfData.text);

        if (info) {
            console.log('--- Analysis Result ---');
            console.log(JSON.stringify(info, null, 2));
        } else {
            console.error('Gemini extraction failed.');
        }
    } else {
        console.error('Could not download/extract fallback PDF.');
    }
}

verifyGemini();

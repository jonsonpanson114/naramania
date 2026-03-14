
import { downloadAndExtractText } from './src/utils/pdf_utils';
import { extractBiddingInfoFromText } from './src/services/gemini_service';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function testFullFlow() {
    // Current valid PDF for testing from Enterprise Bureau
    const testUrl = 'https://h2o.nara.nara.jp/uploaded/attachment/17255.pdf';

    console.log('--- Testing Full PDF Intelligence Flow ---');
    console.log('API KEY Status:', process.env.GOOGLE_GENERATIVE_AI_API_KEY ? 'Present' : 'MISSING');

    const pdfData = await downloadAndExtractText(testUrl);

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
        console.error('Could not download/extract PDF. Please check the URL.');
    }
}

testFullFlow();

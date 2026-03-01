
import { downloadAndExtractText } from './src/utils/pdf_utils';
import { extractBiddingInfoFromText } from './src/services/gemini_service';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function testKatsuragi() {
    // 令和7年12月25日入札分
    const url = 'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-12-25-kekkakouhyou.pdf';
    console.log(`Testing extraction for: ${url}`);

    const pdfData = await downloadAndExtractText(url);
    if (!pdfData) {
        console.error('Failed to download/parse PDF');
        return;
    }

    console.log('--- PDF Text (Partial) ---');
    console.log(pdfData.text.slice(0, 1000));

    // Geminiに投げる。葛城市のPDFは複数の案件が並んでいるため、
    // 本来は案件ごとに分割すべきだが、まずは全体で試す
    const info = await extractBiddingInfoFromText(pdfData.text);
    console.log('--- Extracted Info ---');
    console.log(JSON.stringify(info, null, 2));
}

testKatsuragi().catch(console.error);

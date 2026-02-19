
import { downloadAndExtractText } from './src/utils/pdf_utils';

async function testPdf() {
    // Example: A public PDF relate to Nara City bidding if possible, or a generic one
    const testUrl = 'https://www.city.nara.lg.jp/uploaded/attachment/172350.pdf'; // Sample from Nara City

    console.log('Testing PDF Extraction...');
    const result = await downloadAndExtractText(testUrl);

    if (result) {
        console.log('--- Extraction Successful ---');
        console.log(`Pages: ${result.numpages}`);
        console.log('Preview (First 500 chars):');
        console.log(result.text.substring(0, 500));

        // Check for keywords
        const keywords = ['予定価格', '入札', '資格', '工事'];
        keywords.forEach(kw => {
            if (result.text.includes(kw)) {
                console.log(`[Found Keyword]: ${kw}`);
            }
        });
    } else {
        console.error('Failed to extract PDF');
    }
}

testPdf();

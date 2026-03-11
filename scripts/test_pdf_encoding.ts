import { downloadAndExtractText } from './src/utils/pdf_utils';
import fs from 'fs';

async function main() {
    const testUrl = 'https://www.city.kashihara.nara.jp/material/files/group/20/5072001304.pdf';
    const pdfData = await downloadAndExtractText(testUrl);
    if (pdfData) {
        fs.writeFileSync('raw_pdf_text.txt', pdfData.text, 'utf-8');
        console.log('Saved raw text to raw_pdf_text.txt');
    }
}
main();

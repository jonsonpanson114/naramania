import axios from 'axios';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
import fs from 'fs';
import path from 'path';

export interface PDFData {
    text: string;
    numpages: number;
}

export async function downloadAndExtractText(url: string): Promise<PDFData | null> {
    try {
        console.log(`Downloading PDF from: ${url}`);
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const buffer = Buffer.from(response.data);

        // Check if using pdf-parse v2 (Class API) or v1 (Function API)
        if (pdf.PDFParse) {
            const parser = new pdf.PDFParse({ data: buffer });
            const textResult = await parser.getText();
            let fullText = '';
            if (textResult && textResult.pages) {
                fullText = textResult.pages.map((p: any) => p.text).join('\n\n');
            } else if (textResult && textResult.text) {
                fullText = textResult.text;
            }
            return {
                text: fullText,
                numpages: textResult?.pages?.length || 0
            };
        } else {
            const data = await pdf(buffer);
            return {
                text: data.text,
                numpages: data.numpages
            };
        }
    } catch (error: any) {
        console.error(`Error processing PDF from ${url}:`, error.message || error);
        return null;
    }
}

// Utility for testing or saving local copies if needed
export async function saveTempPdf(buffer: Buffer, filename: string): Promise<string> {
    const tempDir = path.join(process.cwd(), 'temp_pdfs');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }
    const filePath = path.join(tempDir, filename);
    fs.writeFileSync(filePath, buffer);
    return filePath;
}

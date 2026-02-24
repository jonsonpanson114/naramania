import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Use dynamic import for ESM pdfjs-dist
const { getDocument, GlobalWorkerOptions } = await import(
    'c:/Users/jonso/.gemini/antigravity/playground/azimuthal-pioneer/naramania/node_modules/pdfjs-dist/legacy/build/pdf.mjs'
);

// Disable worker for Node.js
GlobalWorkerOptions.workerSrc = '';

const data = new Uint8Array(readFileSync('./node_modules/pdfjs-dist/build/pdf.mjs'));
// Actually load our sample PDF
const pdfData = new Uint8Array(readFileSync('./_sample.pdf'));

try {
    const loadingTask = getDocument({ data: pdfData, disableFontFace: true, verbosity: 0, isEvalSupported: false });
    const doc = await loadingTask.promise;
    console.log('Pages:', doc.numPages);
    let fullText = '';
    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join('');
        fullText += pageText + '\n';
    }
    console.log('Text:', fullText);
} catch (e) {
    console.error('Error:', e.message);
}

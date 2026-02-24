// Try pdfjs-dist with dynamic import in CJS context
async function main() {
    const pdfjs = await import('file:///c:/Users/jonso/.gemini/antigravity/playground/azimuthal-pioneer/naramania/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
    const { getDocument, GlobalWorkerOptions } = pdfjs;

    // Disable worker in Node.js context
    // Use no-worker mode
    // GlobalWorkerOptions.workerSrc = '';

    const fs = require('fs');
    const pdfData = new Uint8Array(fs.readFileSync('./_sample.pdf'));

    const loadingTask = getDocument({ data: pdfData, verbosity: 0, isEvalSupported: false, useWorkerFetch: false, disableStream: true });
    const doc = await loadingTask.promise;
    console.log('ページ数:', doc.numPages);

    let fullText = '';
    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join('');
        fullText += pageText + '\n';
    }
    console.log('テキスト:', fullText);
}

main().catch(e => console.error(e.message));

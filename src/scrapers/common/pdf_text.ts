import axios from 'axios';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; naramania-scraper/1.0)',
};

export function normalizeDocumentText(text: string): string {
    return text.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function parseJapaneseDateToIso(text: string): string {
    const reiwa = text.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (reiwa) {
        const year = 2018 + parseInt(reiwa[1], 10);
        return `${year}-${reiwa[2].padStart(2, '0')}-${reiwa[3].padStart(2, '0')}`;
    }

    const western = text.match(/(20\d{2})\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (western) {
        return `${western[1]}-${western[2].padStart(2, '0')}-${western[3].padStart(2, '0')}`;
    }

    return '';
}

export async function extractPdfText(pdfUrl: string, maxPages = 6): Promise<string> {
    const res = await axios.get<ArrayBuffer>(pdfUrl, {
        responseType: 'arraybuffer',
        headers: HEADERS,
        timeout: 20000,
    });
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(res.data as ArrayBuffer);
    const doc = await pdfjsLib.getDocument({ data, verbosity: 0, isEvalSupported: false }).promise;

    let text = '';
    for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => ('str' in item ? item.str : '')).join(' ');
        text += '\n';
    }

    return normalizeDocumentText(text);
}


import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfModule = require('pdf-parse'); 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env.local') });

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

const ANDO_LINKS = [
    'https://www.town.ando.nara.jp/cmsfiles/contents/0000003/3715/kiroku.pdf',
    'https://www.town.ando.nara.jp/cmsfiles/contents/0000003/3793/koukaikiroku.pdf'
];

async function extractInfo(text) {
    const prompt = `
以下の入札結果テキスト（安堵町）から、建築、設備、設計、コンサルに関連する案件を特定し、JSON形式の配列で出力してください。

抽出項目:
- title: 案件名
- winningContractor: 落札業者（不明なら null）
- estimatedPrice: 落札金額（不明なら null）
- status: "落札" 固定

出力形式:
[
  { "title": "案件A", "winningContractor": "株式会社A", "estimatedPrice": "10,000,000円", "status": "落札" }
]
テキスト:
${text}
`;
    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const cleanJson = response.text().replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(cleanJson);
    } catch (e) { return []; }
}

async function run() {
    let allNewItems = [];
    for (const url of ANDO_LINKS) {
        console.log(`Processing Ando Link: ${url}`);
        try {
            const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
            const parser = new pdfModule.PDFParse({ data: Buffer.from(response.data) });
            const textResult = await parser.getText();
            const fullText = (textResult.pages || []).map(p => p.text).join('\n') || '';

            if (fullText) {
                const items = await extractInfo(fullText);
                items.forEach(it => {
                    allNewItems.push({
                        ...it, municipality: '安堵町',
                        id: `ando-${it.title}-${Date.now()}`,
                        announcementDate: '2025-10-01',
                        link: url
                    });
                });
            }
        } catch (e) { console.error(`  Error: ${e.message}`); }
    }

    if (allNewItems.length > 0) {
        const resultPath = 'scraper_result.json';
        const existingData = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
        fs.writeFileSync(resultPath, JSON.stringify([...existingData, ...allNewItems], null, 2));
        console.log(`Updated results with ${allNewItems.length} items for Ando Town.`);
    }
}

run();

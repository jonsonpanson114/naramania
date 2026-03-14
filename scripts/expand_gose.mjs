
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

const GOSE_LINKS = [
    'https://www.city.gose.nara.jp/cmsfiles/contents/0000001/1024/R070421kaisatu.pdf',
    'https://www.city.gose.nara.jp/cmsfiles/contents/0000001/1024/R07052223.pdf',
    'https://www.city.gose.nara.jp/cmsfiles/contents/0000001/1024/R070620.pdf',
    'https://www.city.gose.nara.jp/cmsfiles/contents/0000001/1024/R70722kaisatu.pdf',
    'https://www.city.gose.nara.jp/cmsfiles/contents/0000001/1024/R070820.pdf',
    'https://www.city.gose.nara.jp/cmsfiles/contents/0000001/1024/R070919.pdf',
    'https://www.city.gose.nara.jp/cmsfiles/contents/0000001/1024/R71020.pdf',
    'https://www.city.gose.nara.jp/cmsfiles/contents/0000001/1024/R071120.pdf',
    'https://www.city.gose.nara.jp/cmsfiles/contents/0000001/1024/R71219kaisatu.pdf',
    'https://www.city.gose.nara.jp/cmsfiles/contents/0000001/1024/R80120kaisatu.pdf',
    'https://www.city.gose.nara.jp/cmsfiles/contents/0000001/1024/R08220kaisatu.pdf'
];

async function extractInfo(text) {
    const prompt = `
以下の入札結果テキストから、建築、設備、設計、コンサルに関連する案件をすべて特定し、JSON形式の配列で出力してください。
不純物（物品購入、焼却、ゴミ収集、土木工事、舗装、道路、橋、河川、剪定、車両購入など）は徹底的に除外してください。

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
    } catch (e) {
        return [];
    }
}

async function runBatch() {
    let allNewItems = [];
    
    for (const url of GOSE_LINKS) {
        console.log(`Processing: ${url}`);
        try {
            const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
            const buffer = Buffer.from(response.data);
            const parser = new pdfModule.PDFParse({ data: buffer });
            const textResult = await parser.getText();
            
            let fullText = '';
            if (textResult && textResult.pages) {
                fullText = textResult.pages.map(p => p.text).join('\n\n');
            } else if (textResult && textResult.text) {
                fullText = textResult.text;
            }

            if (fullText) {
                const items = await extractInfo(fullText);
                console.log(`  -> Found ${items.length} relevant items`);
                items.forEach(it => {
                    allNewItems.push({
                        ...it,
                        municipality: '御所市',
                        id: `gose-result-${it.title.slice(0, 10)}-${Date.now()}`,
                        announcementDate: '2025-04-01', // FY2025 Placeholder
                        link: url
                    });
                });
            }
        } catch (e) {
            console.error(`  Error processing ${url}:`, e.message);
        }
    }

    if (allNewItems.length > 0) {
        console.log(`\nSuccess! Extracted ${allNewItems.length} items from Gose City results.`);
        const scraperResultPath = path.join(process.cwd(), 'scraper_result.json');
        const existingData = JSON.parse(fs.readFileSync(scraperResultPath, 'utf8'));
        
        fs.writeFileSync(scraperResultPath, JSON.stringify([...existingData, ...allNewItems], null, 2));
        console.log(`Updated ${scraperResultPath}`);
    }
}

runBatch();


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
if (!apiKey) {
    console.error('API Key not found');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

async function extractInfo(text) {
    const prompt = `
以下の入札結果テキストから、建築、設備、設計、コンサルに関連する案件をすべて特定し、JSON形式の配列で出力してください。
不純物（物品購入、焼却、ゴミ収集、土木工事、河川、橋、道路など）は除外してください。

抽出項目:
- title: 案件名
- winningContractor: 落札業者（不明なら null）
- estimatedPrice: 落札金額（不明なら null）
- status: "落札" 固定

出力フォーマット:
[
  { "title": "案件A", "winningContractor": "株式会社A", "estimatedPrice": "10,000,000円", "status": "落札" },
  ...
]

テキスト:
${text}
`;
    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const responseText = response.text();
        const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(cleanJson);
    } catch (e) {
        console.error('Gemini Error:', e.message);
        return [];
    }
}

async function run() {
    const pdfUrl = 'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-12-25-kekkakouhyou.pdf';
    console.log(`Processing with PDFParse (v2): ${pdfUrl}`);
    
    try {
        const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);
        
        // Use v2 Class API
        const parser = new pdfModule.PDFParse({ data: buffer });
        const textResult = await parser.getText();
        
        let fullText = '';
        if (textResult && textResult.pages) {
            fullText = textResult.pages.map(p => p.text).join('\n\n');
        } else if (textResult && textResult.text) {
            fullText = textResult.text;
        }

        if (!fullText) {
            console.error('No text extracted from PDF');
            return;
        }

        const items = await extractInfo(fullText);
        
        console.log('--- Extracted Results ---');
        console.log(JSON.stringify(items, null, 2));
    } catch (e) {
        console.error('Error:', e);
    }
}

run();

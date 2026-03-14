
const axios = require('axios');
const pdf = require('pdf-parse'); 
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });

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
不純物（物品購入、焼却、ゴミ収集、土木工事、河川、橋、道路など）は徹底的に除外してください。
建築一式、電気、管、機械、塗装、防水、内装、解体、設計、測量は含めてください。

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
    console.log('--- Checking pdf-parse structure ---');
    console.log('Type of pdf:', typeof pdf);
    console.log('Keys of pdf:', Object.keys(pdf));

    const pdfUrl = 'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-12-25-kekkakouhyou.pdf';
    console.log(`Processing: ${pdfUrl}`);
    
    try {
        const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);
        
        // Final attempt at resolving the function
        let parseFunc = pdf;
        if (typeof pdf !== 'function' && pdf.default) parseFunc = pdf.default;
        if (typeof parseFunc !== 'function') {
             // Fallback: try manual requirement if first failed
             parseFunc = require('pdf-parse/lib/pdf-parse.js');
        }

        const data = await parseFunc(buffer);
        const items = await extractInfo(data.text);
        
        console.log('--- Extracted Results ---');
        console.log(JSON.stringify(items, null, 2));
    } catch (e) {
        console.error('Error during execution:', e);
    }
}

run();

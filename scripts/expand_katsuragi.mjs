
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

const KATSURAGI_LINKS = [
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2026-2-26-kekkakouhyou-2.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2026-2-2-kekkakouhyou-ippan.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2026-1-23-kekkakouhyou.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2026-1-13-kekkakouhyou-ippan.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-12-25-kekkakouhyou.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-12-5-kekkakouhyou.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-11-25-kekkakouhyou.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-11-11-kekkakouhyou-ippan.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-10-31-kekkakouhyou.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-10-02-kekkakouhyou-ippan.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-09-26-kekkakouhyou-2.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-09-25-kekkakouhyou.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-09-18-kekkakouhyou.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-09-09-kekkakouhyou.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-08-28-kekkakouhyou.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-08-05-kekkakouhyou2.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-7-30-kekkakouhyou.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-7-29-kekkakouhyou.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-07-09-kekkakouhyou.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-07-02-kekkakouhyou.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-06-30-kekkakouhyou.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/20250626simeikyousounyuusatukouhyousyo.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/20250626giketu05140515.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-6-25-kekkakouhyou-2.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-06-13-kekkakouhyou.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-06-12-kekkakouhyou.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-5-29-kekkakouhyou.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-5-28-kekkakouhyou3.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-05-15-kekkakohyou2.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/2025-05-14-kekkakouhyou3.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/R070430.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/R70428nyuusatubunn.pdf',
    'https://www.city.katsuragi.nara.jp/material/files/group/6/R70425nyuusatubunn.pdf'
];

// 進捗管理
const PROGRESS_FILE = 'katsuragi_progress.json';
let processedUrls = [];
if (fs.existsSync(PROGRESS_FILE)) {
    processedUrls = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
}

async function extractInfo(text) {
    const prompt = `
以下の入札結果テキストから、建築、設備、設計、コンサルに関連する案件をすべて特定し、JSON形式の配列で出力してください。
不純物（物品購入、焼却、ゴミ収集、土木工事、舗装、道路、橋、河川、剪定など）は除外。

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
    const urlsToProcess = KATSURAGI_LINKS.filter(u => !processedUrls.includes(u)).slice(0, 5);
    if (urlsToProcess.length === 0) {
        console.log('All links processed.');
        return;
    }

    let allNewItems = [];
    for (const url of urlsToProcess) {
        console.log(`Processing: ${url}`);
        try {
            const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
            const parser = new pdfModule.PDFParse({ data: Buffer.from(response.data) });
            const textResult = await parser.getText();
            const fullText = (textResult.pages || []).map(p => p.text).join('\n') || textResult.text || '';

            if (fullText) {
                const items = await extractInfo(fullText);
                console.log(`  -> Found ${items.length} items`);
                items.forEach(it => {
                    allNewItems.push({
                        ...it, municipality: '葛城市',
                        id: `katsuragi-${it.title}-${Date.now()}`,
                        announcementDate: '2025-04-01',
                        link: url
                    });
                });
            }
            processedUrls.push(url);
        } catch (e) { console.error(`  Error: ${e.message}`); }
    }

    // Save progress
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(processedUrls, null, 2));

    // Save results
    if (allNewItems.length > 0) {
        const resultPath = 'scraper_result.json';
        const existingData = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
        fs.writeFileSync(resultPath, JSON.stringify([...existingData, ...allNewItems], null, 2));
        console.log(`Updated results. Total new: ${allNewItems.length}`);
    }
}

run();

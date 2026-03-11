
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { BiddingItem } from '../src/types/bidding.ts';

const RESULT_PATH = path.join(process.cwd(), 'scraper_result.json');

async function getTagsFromAI(title: string, description: string, model: any) {
    const prompt = `
以下の入札案件のタイトルと要約から、ふさわしいタグを最大3つ抽出してJSONで出力してください。
タグは検索に使いやすい一般的な用語にしてください（例：耐震, 改修, 新築, 解体, 調査, ＩＴ, 建築, 電気, 空調, 測量, 設計, 補修, 土木, 維持管理）。

タイトル: ${title}
要約: ${description}

出力フォーマット:
{"tags": ["Tag1", "Tag2"]}
`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(cleanJson).tags;
    } catch (e) {
        console.error("Gemini Error:", e);
        return null;
    }
}

async function main() {
    console.log('--- Starting Meta-Tagging Generator ---');

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
    if (!apiKey) {
        console.error("API Key missing!");
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

    const rawData = fs.readFileSync(RESULT_PATH, 'utf-8');
    const items: BiddingItem[] = JSON.parse(rawData);

    // Filter items that have a description but NO tags yet
    const targetItems = items.filter(i => i.description && (!i.tags || i.tags.length === 0));
    console.log(`Found ${targetItems.length} items to tag.`);

    for (let i = 0; i < targetItems.length; i++) {
        const item = targetItems[i];
        console.log(`[${i+1}/${targetItems.length}] Tagging: ${item.title}`);
        
        const tags = await getTagsFromAI(item.title, item.description || "", model);
        if (tags) {
            item.tags = tags;
            console.log(`-> Tags: ${tags.join(', ')}`);
        }

        // Save every 10 items to be safe
        if (i % 10 === 0) {
            fs.writeFileSync(RESULT_PATH, JSON.stringify(items, null, 2));
        }

        // Small delay to avoid rate limit
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    fs.writeFileSync(RESULT_PATH, JSON.stringify(items, null, 2));
    console.log('Done tagging!');
}

main();

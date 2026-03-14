
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function testSimple() {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    let log = '';
    if (!apiKey) {
        log += 'No API Key\n';
        fs.writeFileSync('ai_test_result.txt', log);
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const candidates = [
        'gemini-2.5-flash',
        'gemini-2.5-flash-preview-04-17',
        'gemini-2.5-flash-001',
    ];

    for (const m of candidates) {
        log += `Testing ${m}...\n`;
        try {
            const model = genAI.getGenerativeModel({ model: m });
            const result = await model.generateContent('Say hello in Japanese');
            log += `${m} SUCCESS: ${result.response.text().substring(0, 50)}\n`;
        } catch (e: any) {
            log += `${m} FAILED: ${e.message?.substring(0, 100)}\n`;
        }
    }

    fs.writeFileSync('ai_test_result.txt', log);
    console.log(log);
}

testSimple();

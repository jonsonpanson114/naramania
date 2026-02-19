
import * as dotenv from 'dotenv';
import path from 'path';
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function debugGemini() {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    console.log('API Key loaded:', key ? 'YES (Length: ' + key.length + ')' : 'NO');
    if (key) {
        console.log('Key starts with:', key.substring(0, 4) + '...');

        try {
            const genAI = new GoogleGenerativeAI(key);
            // Try 1.5 flash as a safer default if 2.0 is not yet universal
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            console.log('Testing connection with gemini-1.5-flash...');
            const result = await model.generateContent("Hello, are you working?");
            const response = await result.response;
            console.log('Response:', response.text());
        } catch (e: any) {
            console.error('Gemini Test Error:', e.message);
        }
    }
}

debugGemini();


import * as fs from 'fs';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env FIRST
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function verifyIntelligence() {
    console.log('--- Verifying Intelligence using Service (Gemini 2.0 Flash) ---');

    console.log('Importing service...');
    const serviceModule = await import('./src/services/gemini_service.js'); // .js for runtime if compiled? No, tsx handles ts.
    // Wait, tsx handles .ts imports. 
    // Let's try to import .ts if possible or just rely on tsx resolution
    const { extractBiddingInfoFromText } = await import('./src/services/gemini_service');

    const text = fs.readFileSync('sample_result.txt', 'utf-8');

    // Check if API Key is loaded
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        console.error('API Key not found in env');
        return;
    }

    console.log('Calling extractBiddingInfoFromText...');
    try {
        const info = await extractBiddingInfoFromText(text);

        if (info) {
            console.log('--- AI Extraction Result ---');
            const jsonOutput = JSON.stringify(info, null, 2);
            console.log(jsonOutput);
            fs.writeFileSync('intelligence_result.json', jsonOutput);
        } else {
            console.error('Extraction returned null.');
        }
    } catch (e) {
        console.error('Extraction Error:', e);
    }
}

verifyIntelligence();

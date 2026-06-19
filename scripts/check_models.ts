import { GoogleGenerativeAI } from "@google/generative-ai";

async function listModels() {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
    if (!apiKey) return;
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelsToTry = [
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-3.1-flash-lite",
    ];
    for (const m of modelsToTry) {
        try {
            console.log(`Trying ${m}...`);
            const model = genAI.getGenerativeModel({ model: m });
            await model.generateContent("test");
            console.log(`SUCCESS with ${m}!`);
            return;
        } catch (e: unknown) {
            const status = e && typeof e === 'object' && 'status' in e ? e.status : undefined;
            const statusText = e && typeof e === 'object' && 'statusText' in e ? e.statusText : undefined;
            console.error(`Error with ${m}:`, status, statusText);
        }
    }
}
listModels();

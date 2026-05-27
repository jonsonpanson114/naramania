import { GoogleGenerativeAI } from "@google/generative-ai";

async function listModels() {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
    if (!apiKey) return;
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelsToTry = [
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
        "gemini-2.0-flash",
        "gemini-2.0-pro-exp-02-05"
    ];
    for (const m of modelsToTry) {
        try {
            console.log(`Trying ${m}...`);
            const model = genAI.getGenerativeModel({ model: m });
            await model.generateContent("test");
            console.log(`SUCCESS with ${m}!`);
            return;
        } catch (e) {
            console.error(`Error with ${m}:`, e.status, e.statusText);
        }
    }
}
listModels();

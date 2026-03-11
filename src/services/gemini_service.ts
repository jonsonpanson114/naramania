
import { GoogleGenerativeAI } from "@google/generative-ai";

export interface ExtractedBiddingInfo {
    estimatedPrice?: string;
    winningContractor?: string;
    designFirm?: string;
    constructionPeriod?: string;
    description?: string;
    tags?: string[];
}

const BIDDING_INFO_SCHEMA = {
    type: "object",
    properties: {
        estimatedPrice: { type: "string", nullable: true },
        winningContractor: { type: "string", nullable: true },
        designFirm: { type: "string", nullable: true },
        constructionPeriod: { type: "string", nullable: true },
        description: { type: "string" },
        tags: {
            type: "array",
            items: { type: "string" }
        }
    },
    required: ["description"]
};

export async function extractBiddingInfoFromPDF(pdfBuffer: Buffer, mimeType: string = "application/pdf"): Promise<ExtractedBiddingInfo | null> {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
    if (!apiKey) return null;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: "gemini-3.1-flash-lite-preview",
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: BIDDING_INFO_SCHEMA as any,
        },
    });

    const prompt = `
この入札資料（PDF）から情報を抽出してください。
「落札業者名」は最優先で探し、JVの場合はJV名をそのまま抽出してください。
タグは、案件内容にふさわしい一般的な用語を3つまで選んでください（例：耐震, 改修, 建築, 電気, 空調, 調査）。
`;

    let retries = 5;
    while (retries > 0) {
        try {
            const result = await model.generateContent([
                prompt,
                {
                    inlineData: {
                        data: pdfBuffer.toString("base64"),
                        mimeType
                    }
                }
            ]);
            return JSON.parse(result.response.text());
        } catch (error: any) {
            const status = error.status;
            if ((status === 503 || status === 429 || status === 500) && retries > 1) {
                const waitTime = status === 429 ? 20000 : 10000;
                await new Promise(resolve => setTimeout(resolve, waitTime));
                retries--;
                continue;
            }
            console.error("Gemini Native PDF API Error:", error);
            return null;
        }
    }
    return null;
}

export async function extractBiddingInfoFromText(text: string): Promise<ExtractedBiddingInfo | null> {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
    if (!apiKey) return null;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: "gemini-3.1-flash-lite-preview",
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: BIDDING_INFO_SCHEMA as any,
        },
    });

    const prompt = `テキストから入札情報を抽出してください:\n---\n${text}\n---`;

    let retries = 5;
    while (retries > 0) {
        try {
            const result = await model.generateContent(prompt);
            return JSON.parse(result.response.text());
        } catch (error: any) {
            const status = error.status;
            if ((status === 503 || status === 429 || status === 500) && retries > 1) {
                const waitTime = status === 429 ? 20000 : 10000;
                await new Promise(resolve => setTimeout(resolve, waitTime));
                retries--;
                continue;
            }
            console.error("Gemini API Error:", error);
            return null;
        }
    }
    return null;
}

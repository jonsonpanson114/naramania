
import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

export interface ExtractedBiddingInfo {
    estimatedPrice?: string;
    winningContractor?: string;
    designFirm?: string;
    constructionPeriod?: string;
    description?: string;
}

export async function extractBiddingInfoFromText(text: string): Promise<ExtractedBiddingInfo | null> {
    if (!API_KEY) {
        console.warn("No Gemini API key found. Skipping extraction.");
        return null;
    }

    const prompt = `
以下の入札結果または公告のテキストから、指定された情報を抽出し、JSON形式で出力してください。
不明な項目は null にしてください。

抽出項目:
1. 予定価格 または 落札金額（税込み、または税抜きが明記されている場合はそれを含めて抽出）
2. 落札業者名（ゼネコン名、施工業者名など）
3. 設計事務所名（設計を担当した会社名。公告などで設計者が明記されている場合）
4. 工期/納入期限（いつまでに完了するか）
5. 案件内容の要約（200文字以内）

出力フォーマット:
{
  "estimatedPrice": "String or null",
  "winningContractor": "String or null",
  "designFirm": "String or null",
  "constructionPeriod": "String or null",
  "description": "String or null"
}

テキスト内容:
---
${text}
---
`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const responseText = response.text();

        // Clean up JSON if LLM returns markdown code blocks
        const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(cleanJson);
    } catch (error) {
        console.error("Gemini API Error:", error);
        return null;
    }
}

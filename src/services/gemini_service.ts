
import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI: GoogleGenerativeAI | null = null;
let model: any = null;

function getModel() {
    if (!model) {
        const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
        if (!apiKey) return null;
        genAI = new GoogleGenerativeAI(apiKey);
        model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    }
    return model;
}

export interface ExtractedBiddingInfo {
    estimatedPrice?: string;
    winningContractor?: string;
    designFirm?: string;
    constructionPeriod?: string;
    description?: string;
}

export async function extractBiddingInfoFromText(text: string): Promise<ExtractedBiddingInfo | null> {
    const currentModel = getModel();
    if (!currentModel) {
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

重要指示：
- 「落札業者名」は最優先で抽出してください。テキスト内で「落札者」、「契約の相手方」、「決定業者」などの名目で記載されている会社名を探してください。
- 共同企業体（JV）の場合は、JV名（例：○○・□□経常建設共同企業体）をそのまま抽出してください。
- 公告段階の資料で「設計者」が判明している場合は、必ず「designFirm」に入れてください。
- ゼネコン、建設会社、設計事務所、コンサルタント会社の違いに注意し、適切に分類してください。
- 余計な解説は含めず、純粋なJSONのみを出力してください。

テキスト内容:
---
${text}
---
`;

    try {
        const result = await currentModel.generateContent(prompt);
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

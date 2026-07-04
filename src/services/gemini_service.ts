
import { GoogleGenerativeAI } from "@google/generative-ai";

export interface ExtractedBiddingInfo {
    estimatedPrice?: string;
    winningContractor?: string;
    designFirm?: string;
    constructionPeriod?: string;
    description?: string;
    tags?: string[];
}

export interface TargetedPdfResultInfo {
    title: string;
    found: boolean;
    status?: string;
    winningContractor?: string;
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

const PDF_EXTRACTION_MODELS = buildModelCandidates(
    process.env.GOOGLE_GENERATIVE_AI_PDF_MODEL,
    process.env.GOOGLE_GENERATIVE_AI_PDF_MODELS,
    ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-3.1-flash-lite"],
);
const TEXT_EXTRACTION_MODELS = buildModelCandidates(
    process.env.GOOGLE_GENERATIVE_AI_TEXT_MODEL,
    process.env.GOOGLE_GENERATIVE_AI_TEXT_MODELS,
    ["gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash"],
);

function buildModelCandidates(
    primary: string | undefined,
    extraList: string | undefined,
    fallbackModels: string[],
): string[] {
    const candidates = [
        primary,
        ...(extraList || '').split(','),
        ...fallbackModels,
    ]
        .map((model) => model?.trim())
        .filter((model): model is string => Boolean(model));

    return Array.from(new Set(candidates));
}

function isRetryableStatus(status: number): boolean {
    return status === 429 || status === 500 || status === 503;
}

function isModelUnavailableStatus(status: number): boolean {
    return status === 404;
}

function getErrorStatus(error: unknown): number {
    return error && typeof error === 'object' && 'status' in error ? (error.status as number) : 500;
}

export async function extractBiddingInfoFromPDF(pdfBuffer: Buffer, mimeType: string = "application/pdf"): Promise<ExtractedBiddingInfo | null> {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || "";
    if (!apiKey) return null;

    const genAI = new GoogleGenerativeAI(apiKey);
    const prompt = `
この入札資料（PDF）から情報を抽出してください。
「落札業者名」は最優先で探し、JVの場合はJV名をそのまま抽出してください。
タグは、案件内容にふさわしい一般的な用語を3つまで選んでください（例：耐震, 改修, 建築, 電気, 空調, 調査）。
`;

    for (const modelName of PDF_EXTRACTION_MODELS) {
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: BIDDING_INFO_SCHEMA as never,
            },
        });

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
            } catch (error: unknown) {
                const status = getErrorStatus(error);
                if (isModelUnavailableStatus(status)) {
                    console.warn(`Gemini Native PDF model unavailable: ${modelName}. Trying fallback model...`);
                    break;
                }
                if (isRetryableStatus(status) && retries > 1) {
                    const waitTime = status === 429 ? 20000 : 10000;
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    retries--;
                    continue;
                }
                console.error(`Gemini Native PDF API Error (${modelName}):`, error);
                return null;
            }
        }
    }
    console.error(`Gemini Native PDF API Error: no available model in ${PDF_EXTRACTION_MODELS.join(', ')}`);
    return null;
}

export async function extractBiddingInfoFromText(text: string): Promise<ExtractedBiddingInfo | null> {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || "";
    if (!apiKey) return null;

    const genAI = new GoogleGenerativeAI(apiKey);
    const prompt = `テキストから入札情報を抽出してください:\n---\n${text}\n---`;

    for (const modelName of TEXT_EXTRACTION_MODELS) {
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: BIDDING_INFO_SCHEMA as never,
            },
        });

        let retries = 5;
        while (retries > 0) {
            try {
                const result = await model.generateContent(prompt);
                return JSON.parse(result.response.text());
            } catch (error: unknown) {
                const status = getErrorStatus(error);
                if (isModelUnavailableStatus(status)) {
                    console.warn(`Gemini text model unavailable: ${modelName}. Trying fallback model...`);
                    break;
                }
                if (isRetryableStatus(status) && retries > 1) {
                    const waitTime = status === 429 ? 20000 : 10000;
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    retries--;
                    continue;
                }
                console.error(`Gemini API Error (${modelName}):`, error);
                return null;
            }
        }
    }
    console.error(`Gemini API Error: no available text model in ${TEXT_EXTRACTION_MODELS.join(', ')}`);
    return null;
}

export async function extractTargetedResultsFromPDF(
    pdfBuffer: Buffer,
    titles: string[],
    mimeType: string = "application/pdf",
): Promise<TargetedPdfResultInfo[] | null> {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || "";
    if (!apiKey || titles.length === 0) return null;

    const genAI = new GoogleGenerativeAI(apiKey);
    const prompt = `
このPDFは入札結果資料です。次の案件名ごとに、PDF内に存在するかどうかを判定し、見つかった場合は結果ステータス（落札・不調・取止め等）と落札者名を抽出してください。
表記ゆれがあっても同じ案件なら一致として扱ってください。
案件名:
${titles.map((title, index) => `${index + 1}. ${title}`).join("\n")}
`;

    for (const modelName of PDF_EXTRACTION_MODELS) {
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "object",
                    properties: {
                        results: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    title: { type: "string" },
                                    found: { type: "boolean" },
                                    status: { type: "string", nullable: true },
                                    winningContractor: { type: "string", nullable: true },
                                },
                                required: ["title", "found"],
                            },
                        },
                    },
                    required: ["results"],
                } as never,
            },
        });

        let retries = 3;
        while (retries > 0) {
            try {
                const result = await model.generateContent([
                    prompt,
                    {
                        inlineData: {
                            data: pdfBuffer.toString("base64"),
                            mimeType,
                        },
                    },
                ]);
                const parsed = JSON.parse(result.response.text()) as { results?: TargetedPdfResultInfo[] };
                return parsed.results || [];
            } catch (error: unknown) {
                const status = getErrorStatus(error);
                if (isModelUnavailableStatus(status)) {
                    console.warn(`Gemini Targeted PDF model unavailable: ${modelName}. Trying fallback model...`);
                    break;
                }
                if (isRetryableStatus(status) && retries > 1) {
                    await new Promise(resolve => setTimeout(resolve, status === 429 ? 20000 : 10000));
                    retries--;
                    continue;
                }
                console.error(`Gemini Targeted PDF API Error (${modelName}):`, error);
                return null;
            }
        }
    }

    console.error(`Gemini Targeted PDF API Error: no available model in ${PDF_EXTRACTION_MODELS.join(', ')}`);
    return null;
}

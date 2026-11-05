
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

// 先頭が本命で、失敗したら順に後ろへフォールバックする。
// 新モデルが利用できない状況(権限・提供終了など)でも収集が止まらないよう、
// 実績のある2.5系を最後尾に残しておく。
const PDF_EXTRACTION_MODELS = buildModelCandidates(
    process.env.GOOGLE_GENERATIVE_AI_PDF_MODEL,
    process.env.GOOGLE_GENERATIVE_AI_PDF_MODELS,
    ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"],
);
const TEXT_EXTRACTION_MODELS = buildModelCandidates(
    process.env.GOOGLE_GENERATIVE_AI_TEXT_MODEL,
    process.env.GOOGLE_GENERATIVE_AI_TEXT_MODELS,
    ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-2.5-flash-lite", "gemini-2.5-flash"],
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

/**
 * 入札公告PDFから案件名だけを取り出す。
 *
 * 高取町のようにHTML側へ案件名を出さず、スキャン画像のPDFだけを貼る自治体があり、
 * pdf-parse ではテキスト層が無いため1文字も取れない。案件名が無いと
 * 「入札情報（令和8年9月29日執行）」のような見出ししか残らず、
 * 建築案件かどうかを判定できずに丸ごと除外されてしまう。
 *
 * 既存の BIDDING_INFO_SCHEMA に項目を足すと全自治体の抽出結果に影響するため、
 * 案件名専用の最小スキーマで独立させている。
 */
export async function extractAnnouncementTitleFromPDF(
    pdfBuffer: Buffer,
    mimeType: string = "application/pdf",
): Promise<string | null> {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || "";
    if (!apiKey) return null;

    const genAI = new GoogleGenerativeAI(apiKey);
    const prompt = `
この入札公告から「工事名」「業務名」にあたる案件名を1つだけ抜き出してください。
原文の表記をそのまま使い、番号・記号・説明文は含めないでください。
案件名が読み取れない場合は空文字を返してください。
`;

    for (const modelName of PDF_EXTRACTION_MODELS) {
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "object",
                    properties: { title: { type: "string" } },
                    required: ["title"],
                } as never,
            },
        });

        let retries = 3;
        while (retries > 0) {
            try {
                const result = await model.generateContent([
                    prompt,
                    { inlineData: { data: pdfBuffer.toString("base64"), mimeType } },
                ]);
                const parsed = JSON.parse(result.response.text()) as { title?: string };
                return parsed.title?.trim() || null;
            } catch (error: unknown) {
                const status = getErrorStatus(error);
                if (isModelUnavailableStatus(status)) break;
                if (isRetryableStatus(status) && retries > 1) {
                    await new Promise(resolve => setTimeout(resolve, status === 429 ? 20000 : 10000));
                    retries--;
                    continue;
                }
                console.error(`Gemini 案件名抽出エラー (${modelName}):`, error);
                return null;
            }
        }
    }

    return null;
}

export interface ProjectBrief {
    /** この案件の資料に書かれていたか。別の案件の資料しか無ければ false */
    found: boolean;
    /** 何をする工事・業務か。案件名の言い換えではなく中身を書く */
    summary?: string;
    /** 施工場所・履行場所 */
    location?: string;
    /** 構造・階数・面積・棟数・数量などの規模 */
    scale?: string;
    /** 工期・履行期間 */
    period?: string;
    /** 予定価格・最低制限価格など */
    price?: string;
    /** 等級・業種・実績・地域などの参加資格 */
    qualification?: string;
}

const PROJECT_BRIEF_SCHEMA = {
    type: "object",
    properties: {
        found: { type: "boolean" },
        summary: { type: "string", nullable: true },
        location: { type: "string", nullable: true },
        scale: { type: "string", nullable: true },
        period: { type: "string", nullable: true },
        price: { type: "string", nullable: true },
        qualification: { type: "string", nullable: true },
    },
    required: ["found"],
};

/**
 * 案件名を指定して、公告ページやPDFから中身を読み取る。
 *
 * 以前の抽出は案件を指定しておらず「概要」の中身も指示していなかったため、
 * 49件中42件が案件名の繰り返しで、住所だけ・別の資料の題名だけの概要もあった。
 * 1つの資料に複数の案件が載る自治体が多いので、案件名で対象を絞らせる。
 */
export async function extractProjectBrief(
    target: { title: string; municipality: string },
    source: { pageText?: string; pdfs?: Buffer[] },
): Promise<ProjectBrief | null> {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || "";
    if (!apiKey) return null;

    const genAI = new GoogleGenerativeAI(apiKey);
    const prompt = `
次の資料から、指定した案件1件についてだけ情報を抜き出してください。

案件名: ${target.title}
発注者: ${target.municipality}

守ること:
- 資料に書かれていることだけを答える。推測で補わない。書かれていない項目は null にする
- 資料には別の案件も載っていることがある。指定の案件の内容だけを使う
- 指定の案件についての記述が資料に無ければ found を false にする
- summary は、どの建物の何を、どう工事するのかを1〜3文で書く。案件名の繰り返しや「〜の入札公告です」は書かない
- location は施工場所、scale は構造・階数・面積・棟数・数量、period は工期、price は予定価格など金額、qualification は等級・業種・実績など参加資格

${source.pageText ? `--- 公告ページの本文 ---\n${source.pageText}\n---` : ""}
`;
    const parts = [
        prompt,
        ...(source.pdfs || []).map(pdf => ({ inlineData: { data: pdf.toString("base64"), mimeType: "application/pdf" } })),
    ];

    for (const modelName of PDF_EXTRACTION_MODELS) {
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: PROJECT_BRIEF_SCHEMA as never,
            },
        });

        let retries = 3;
        while (retries > 0) {
            try {
                const result = await model.generateContent(parts);
                return JSON.parse(result.response.text()) as ProjectBrief;
            } catch (error: unknown) {
                const status = getErrorStatus(error);
                if (isModelUnavailableStatus(status)) break;
                if (isRetryableStatus(status) && retries > 1) {
                    await new Promise(resolve => setTimeout(resolve, status === 429 ? 20000 : 10000));
                    retries--;
                    continue;
                }
                console.error(`Gemini 案件概要の抽出エラー (${modelName}):`, error);
                return null;
            }
        }
    }

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

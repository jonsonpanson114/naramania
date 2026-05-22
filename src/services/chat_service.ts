import fs from 'fs';
import path from 'path';
import { BiddingItem, Municipality } from '@/types/bidding';

export interface ChatSource {
    type: 'local' | 'web';
    title: string;
    url: string;
    snippet?: string;
    municipality?: string;
    date?: string;
}

export interface ChatResponsePayload {
    answer: string;
    sources: ChatSource[];
    localMatches: BiddingItem[];
    followups: string[];
    usedWebSearch: boolean;
    model: string;
}

const RESULT_PATH = path.join(process.cwd(), 'scraper_result.json');
const CHAT_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        answer: { type: 'string' },
        followups: {
            type: 'array',
            items: { type: 'string' },
        },
    },
    required: ['answer'],
};

const MUNICIPALITIES: Municipality[] = [
    '奈良県', '奈良市', '橿原市', '生駒市', '大和高田市', '大和郡山市',
    '葛城市', '五條市', '御所市', '天理市', '桜井市', '宇陀市', '田原本町',
    '広陵町', '香芝市', '川西町', '三宅町', '山添村', '平群町', '安堵町',
    '高取町', '斑鳩町', '三郷町', '王寺町', '大淀町',
];

function getChatModelName(): string {
    return process.env.GOOGLE_GENERATIVE_AI_CHAT_MODEL || 'gemini-3.1-flash-lite';
}

function getNowInJst(): Date {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
}

function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}

function getThisWeekRangeJst() {
    const now = getNowInJst();
    const start = new Date(now);
    const day = start.getDay();
    const diff = (day + 6) % 7;
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return {
        start,
        end,
        startLabel: formatDate(start),
        endLabel: formatDate(end),
    };
}

function normalizeText(value: string): string {
    return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokenizeQuery(query: string): string[] {
    const normalized = normalizeText(query)
        .replace(/[「」『』【】()（）!?！？:：,，.。]/g, ' ')
        .trim();

    const tokens = normalized
        .split(/\s+/)
        .map(token => token.trim())
        .filter(token => token.length >= 2);

    if (normalized.length >= 6) {
        tokens.unshift(normalized);
    }

    return Array.from(new Set(tokens));
}

function readBiddingItems(): BiddingItem[] {
    if (!fs.existsSync(RESULT_PATH)) return [];
    const data = JSON.parse(fs.readFileSync(RESULT_PATH, 'utf-8')) as BiddingItem[];
    return data.sort((a, b) => {
        const aTime = new Date(a.announcementDate || '1900-01-01').getTime();
        const bTime = new Date(b.announcementDate || '1900-01-01').getTime();
        return bTime - aTime;
    });
}

function inferMunicipality(query: string): Municipality | null {
    return MUNICIPALITIES.find(municipality => query.includes(municipality)) || null;
}

function scoreItem(item: BiddingItem, query: string, tokens: string[]): number {
    const haystack = normalizeText([
        item.title,
        item.municipality,
        item.type,
        item.status,
        item.winningContractor,
        item.designFirm,
        item.description,
        item.tags?.join(' '),
    ].filter(Boolean).join(' '));

    let score = 0;
    const normalizedQuery = normalizeText(query);
    if (normalizedQuery && haystack.includes(normalizedQuery)) score += 18;
    if (normalizeText(item.title).includes(normalizedQuery)) score += 20;

    for (const token of tokens) {
        if (normalizeText(item.title).includes(token)) score += 10;
        else if (haystack.includes(token)) score += 4;
    }

    if (query.includes(item.municipality)) score += 6;
    if (query.includes('落札') && item.status === '落札') score += 5;
    if ((query.includes('受付中') || query.includes('募集中')) && item.status === '受付中') score += 5;
    if ((query.includes('設計') || query.includes('監理')) && item.type === 'コンサル') score += 4;
    if (query.includes('工事') && (item.type === '建築' || item.type === '工事')) score += 4;

    return score;
}

function findLocalMatches(query: string, items: BiddingItem[]): BiddingItem[] {
    const tokens = tokenizeQuery(query);
    const municipality = inferMunicipality(query);
    const weekRange = query.includes('今週') ? getThisWeekRangeJst() : null;
    const wantsBidding = /開札|入札日|締切/.test(query);
    const wantsAnnouncement = /公告|新着|最近/.test(query);
    const wantsAwarded = query.includes('落札');
    const wantsOpen = query.includes('受付中');

    let candidates = [...items];
    if (municipality) {
        candidates = candidates.filter(item => item.municipality === municipality);
    }
    if (wantsAwarded) {
        candidates = candidates.filter(item => item.status === '落札');
    }
    if (wantsOpen) {
        candidates = candidates.filter(item => item.status === '受付中');
    }
    if (weekRange) {
        const targetKey = wantsBidding ? 'biddingDate' : 'announcementDate';
        candidates = candidates.filter(item => {
            const dateValue = item[targetKey];
            if (!dateValue) return false;
            return dateValue >= weekRange.startLabel && dateValue <= weekRange.endLabel;
        });
    }

    const scored = candidates
        .map(item => ({ item, score: scoreItem(item, query, tokens) }))
        .filter(entry => {
            if (tokens.length === 0) return true;
            return entry.score > 0 || wantsBidding || wantsAnnouncement || wantsAwarded || wantsOpen;
        })
        .sort((a, b) => b.score - a.score || b.item.announcementDate.localeCompare(a.item.announcementDate));

    const ranked = scored.map(entry => entry.item);

    if (wantsBidding && weekRange) {
        return ranked.sort((a, b) => (a.biddingDate || '').localeCompare(b.biddingDate || '')).slice(0, 12);
    }

    if (wantsAnnouncement) {
        return ranked.sort((a, b) => b.announcementDate.localeCompare(a.announcementDate)).slice(0, 12);
    }

    return ranked.slice(0, 10);
}

function buildLocalSources(matches: BiddingItem[]): ChatSource[] {
    return matches.slice(0, 6).map(item => ({
        type: 'local',
        title: item.title,
        url: item.link,
        municipality: item.municipality,
        date: item.biddingDate || item.announcementDate,
        snippet: [
            item.municipality,
            `公告 ${item.announcementDate}`,
            item.biddingDate ? `開札 ${item.biddingDate}` : '',
            item.status,
            item.winningContractor ? `落札者 ${item.winningContractor}` : '',
        ].filter(Boolean).join(' / '),
    }));
}

function extractTextFromCandidate(response: GeminiRestResponse): string {
    return response.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim() || '';
}

function buildPrompt(query: string, localMatches: BiddingItem[]): string {
    const today = getNowInJst().toLocaleDateString('ja-JP');
    const weekRange = getThisWeekRangeJst();
    const localSummary = localMatches.length
        ? localMatches.map((item, index) =>
            `${index + 1}. ${item.title} / ${item.municipality} / 公告 ${item.announcementDate}${item.biddingDate ? ` / 開札 ${item.biddingDate}` : ''} / ${item.status}${item.winningContractor ? ` / 落札者 ${item.winningContractor}` : ''} / ${item.link}`,
        ).join('\n')
        : '該当するローカル案件は見つかっていません。';

    return `
あなたは奈良県の建築・設計系入札案件を案内するアシスタントです。
今日は ${today} です。今週は ${weekRange.startLabel} から ${weekRange.endLabel} です。

以下のルールで日本語回答してください。
- まずローカル案件データを優先して答える
- ローカルで足りない場合のみ、Google Search grounding で補足してよい
- 日付はできるだけ具体的に YYYY-MM-DD で書く
- 断定できないことは「確認中」「Web上ではこう見える」と分けて書く
- 回答は実務向けに簡潔に、必要なら箇条書きを使う
- 最後に次に聞くと役立つ短い followups を 3 件まで返す

質問:
${query}

ローカル案件データ:
${localSummary}
`;
}

interface GeminiRestResponse {
    candidates?: Array<{
        content?: {
            parts?: Array<{ text?: string }>;
        };
        groundingMetadata?: {
            webSearchQueries?: string[];
            groundingChunks?: Array<{
                web?: {
                    uri?: string;
                    title?: string;
                };
            }>;
        };
    }>;
}

async function callGeminiChat(prompt: string, useGoogleSearch: boolean, modelName: string, apiKey: string) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
            contents: [
                {
                    parts: [{ text: prompt }],
                },
            ],
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: CHAT_RESPONSE_SCHEMA,
                temperature: 0.4,
            },
            ...(useGoogleSearch ? { tools: [{ google_search: {} }] } : {}),
        }),
        cache: 'no-store',
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} ${errorText}`);
    }

    return response.json() as Promise<GeminiRestResponse>;
}

function extractGroundedSources(response: GeminiRestResponse): ChatSource[] {
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources: ChatSource[] = [];

    for (const chunk of chunks) {
        const uri = chunk.web?.uri;
        const title = chunk.web?.title;
        if (!uri || !title) continue;
        if (sources.some(source => source.url === uri)) continue;
        sources.push({
            type: 'web',
            title,
            url: uri,
        });
    }

    return sources.slice(0, 6);
}

export async function answerBiddingQuestion(query: string): Promise<ChatResponsePayload> {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
        throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not set');
    }

    const items = readBiddingItems();
    const localMatches = findLocalMatches(query, items);
    const localSources = buildLocalSources(localMatches);
    const modelName = getChatModelName();
    const shouldUseWebSearch = localMatches.length < 4 || /ネット|検索|調べて|見つからない|サイトにない/.test(query);
    const prompt = buildPrompt(query, localMatches);
    const result = await callGeminiChat(prompt, shouldUseWebSearch, modelName, apiKey);
    const parsed = JSON.parse(extractTextFromCandidate(result)) as { answer: string; followups?: string[] };
    const webSources = extractGroundedSources(result);

    return {
        answer: parsed.answer,
        sources: [...localSources, ...webSources],
        localMatches,
        followups: parsed.followups?.slice(0, 3) || [],
        usedWebSearch: webSources.length > 0,
        model: modelName,
    };
}

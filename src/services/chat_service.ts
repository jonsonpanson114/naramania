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

export interface ChatTurn {
    role: 'user' | 'assistant';
    content: string;
}

export interface ChatContext {
    lastIntent?: {
        municipality: Municipality | null;
        wantsBidding: boolean;
        wantsAnnouncement: boolean;
        wantsAwarded: boolean;
        wantsOpen: boolean;
        wantsThisWeek: boolean;
        wantsLastWeek: boolean;
        wantsThisMonth: boolean;
        wantsDesign: boolean;
        wantsConstruction: boolean;
        wantsWinner: boolean;
    };
    lastResultIds?: string[];
    lastQuestion?: string;
}

export interface ChatResponsePayload {
    answer: string;
    sources: ChatSource[];
    localMatches: BiddingItem[];
    followups: string[];
    usedWebSearch: boolean;
    model: string;
    context: ChatContext;
}

interface GeminiRestResponse {
    candidates?: Array<{
        content?: {
            parts?: Array<{ text?: string }>;
        };
        groundingMetadata?: {
            groundingChunks?: Array<{
                web?: {
                    uri?: string;
                    title?: string;
                };
            }>;
        };
    }>;
}

interface QueryIntent {
    municipality: Municipality | null;
    wantsBidding: boolean;
    wantsAnnouncement: boolean;
    wantsAwarded: boolean;
    wantsOpen: boolean;
    wantsThisWeek: boolean;
    wantsLastWeek: boolean;
    wantsThisMonth: boolean;
    wantsDesign: boolean;
    wantsConstruction: boolean;
    wantsWinner: boolean;
    explicitWebSearch: boolean;
    asksSpecificProject: boolean;
    wantsCarryOver: boolean;
}

const MUNICIPALITY_ALIASES: Array<{ canonical: Municipality; aliases: string[] }> = [
    { canonical: '五條市', aliases: ['五条市'] },
    { canonical: '田原本町', aliases: ['たわらもと町'] },
];

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
    return getRelativeWeekRangeJst(0);
}

function getRelativeWeekRangeJst(weekOffset: number) {
    const now = getNowInJst();
    const start = new Date(now);
    const day = start.getDay();
    const diff = (day + 6) % 7;
    start.setDate(start.getDate() - diff);
    start.setDate(start.getDate() + weekOffset * 7);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return {
        startLabel: formatDate(start),
        endLabel: formatDate(end),
    };
}

function getThisMonthRangeJst() {
    const now = getNowInJst();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
        startLabel: formatDate(start),
        endLabel: formatDate(end),
    };
}

function normalizeText(value: string): string {
    return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeQueryForIntent(value: string): string {
    let normalized = value.normalize('NFKC');
    for (const alias of MUNICIPALITY_ALIASES) {
        for (const alt of alias.aliases) {
            normalized = normalized.replaceAll(alt, alias.canonical);
        }
    }
    return normalized;
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
    const normalizedQuery = normalizeQueryForIntent(query);
    return MUNICIPALITIES.find(municipality => normalizedQuery.includes(municipality)) || null;
}

function looksLikeSpecificProject(query: string): boolean {
    if (query.length < 12) return false;
    if (/今週|今月|新着|最新|一覧|まとめ|教えて|ありますか|ある\?|ある？|何件|どれ|どんな|見せて/.test(query)) {
        return false;
    }
    return /学校|小学校|中学校|こども園|庁舎|公民館|体育館|改修|工事|設計|監理|業務委託|委託/.test(query);
}

function isContinuationQuery(query: string): boolean {
    return /それぞれ|その中|その案件|その結果|この中|前の|さっき|続けて|じゃあ|では|それで|その一覧/.test(query);
}

function inferIntent(query: string, history: ChatTurn[]): QueryIntent {
    const recentUserContext = history
        .filter(turn => turn.role === 'user')
        .slice(-2)
        .map(turn => turn.content)
        .join(' ');
    const fullQuery = normalizeQueryForIntent(`${recentUserContext} ${query}`.trim());

    return {
        municipality: inferMunicipality(fullQuery),
        wantsBidding: /開札|入札日|締切|いつ/.test(fullQuery),
        wantsAnnouncement: /公告|新着|最近|最新/.test(fullQuery),
        wantsAwarded: /落札|結果/.test(fullQuery),
        wantsOpen: /受付中|募集中/.test(fullQuery),
        wantsThisWeek: /今週/.test(fullQuery),
        wantsLastWeek: /先週/.test(fullQuery),
        wantsThisMonth: /今月/.test(fullQuery),
        wantsDesign: /設計|監理|コンサル|委託/.test(fullQuery),
        wantsConstruction: /工事|改修|新築|解体/.test(fullQuery),
        wantsWinner: /ゼネコン|元請け|施工会社|落札者|業者/.test(fullQuery),
        explicitWebSearch: /ネット|web|検索|調べて|見つからない|サイトにない|他にも/.test(fullQuery),
        asksSpecificProject: looksLikeSpecificProject(fullQuery),
        wantsCarryOver: isContinuationQuery(query),
    };
}

function hasExplicitScope(intent: QueryIntent): boolean {
    return Boolean(
        intent.municipality ||
        intent.wantsBidding ||
        intent.wantsAnnouncement ||
        intent.wantsAwarded ||
        intent.wantsOpen ||
        intent.wantsThisWeek ||
        intent.wantsLastWeek ||
        intent.wantsThisMonth ||
        intent.wantsDesign ||
        intent.wantsConstruction ||
        intent.asksSpecificProject
    );
}

function mergeIntentWithContext(intent: QueryIntent, context?: ChatContext): QueryIntent {
    const previous = context?.lastIntent;
    if (!previous) return intent;

    const shouldCarryOver = intent.wantsCarryOver || (intent.wantsWinner && !hasExplicitScope(intent));
    if (!shouldCarryOver) return intent;

    return {
        ...intent,
        municipality: intent.municipality || previous.municipality || null,
        wantsBidding: intent.wantsBidding || previous.wantsBidding,
        wantsAnnouncement: intent.wantsAnnouncement || previous.wantsAnnouncement,
        wantsAwarded: intent.wantsAwarded || previous.wantsAwarded,
        wantsOpen: intent.wantsOpen || previous.wantsOpen,
        wantsThisWeek: intent.wantsThisWeek || (!intent.wantsLastWeek && previous.wantsThisWeek),
        wantsLastWeek: intent.wantsLastWeek || (!intent.wantsThisWeek && previous.wantsLastWeek),
        wantsThisMonth: intent.wantsThisMonth || previous.wantsThisMonth,
        wantsDesign: intent.wantsDesign || previous.wantsDesign,
        wantsConstruction: intent.wantsConstruction || previous.wantsConstruction,
        wantsWinner: intent.wantsWinner || previous.wantsWinner,
    };
}

function scoreItem(item: BiddingItem, query: string, tokens: string[], intent: QueryIntent): number {
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
    if (normalizedQuery && haystack.includes(normalizedQuery)) score += 20;
    if (normalizeText(item.title).includes(normalizedQuery)) score += 24;

    for (const token of tokens) {
        if (normalizeText(item.title).includes(token)) score += 10;
        else if (haystack.includes(token)) score += 4;
    }

    if (intent.municipality && item.municipality === intent.municipality) score += 8;
    if (intent.wantsAwarded && item.status === '落札') score += 5;
    if (intent.wantsOpen && item.status === '受付中') score += 5;
    if (intent.wantsDesign && item.type === 'コンサル') score += 4;
    if (intent.wantsConstruction && (item.type === '建築' || item.type === '工事')) score += 4;

    return score;
}

function isWithinRange(dateValue: string | undefined, startLabel: string, endLabel: string): boolean {
    if (!dateValue) return false;
    return dateValue >= startLabel && dateValue <= endLabel;
}

function findLocalMatches(query: string, items: BiddingItem[], history: ChatTurn[], context?: ChatContext): BiddingItem[] {
    const tokens = tokenizeQuery(query);
    const intent = mergeIntentWithContext(inferIntent(query, history), context);
    const weekRange = intent.wantsThisWeek
        ? getRelativeWeekRangeJst(0)
        : intent.wantsLastWeek
            ? getRelativeWeekRangeJst(-1)
            : null;
    const monthRange = intent.wantsThisMonth ? getThisMonthRangeJst() : null;

    const previousResultIds = new Set(context?.lastResultIds || []);
    let candidates = previousResultIds.size > 0 && intent.wantsCarryOver
        ? items.filter((item) => previousResultIds.has(item.id))
        : [...items];
    if (intent.municipality) {
        candidates = candidates.filter(item => item.municipality === intent.municipality);
    }
    if (intent.wantsAwarded) {
        candidates = candidates.filter(item => item.status === '落札');
    }
    if (intent.wantsOpen) {
        candidates = candidates.filter(item => item.status === '受付中');
    }
    if (intent.wantsDesign && !intent.wantsConstruction) {
        candidates = candidates.filter(item => item.type === 'コンサル' || /設計|監理/.test(item.title));
    }
    if (intent.wantsConstruction && !intent.wantsDesign) {
        candidates = candidates.filter(item => item.type === '建築' || item.type === '工事');
    }
    if (weekRange) {
        const targetKey = intent.wantsBidding ? 'biddingDate' : 'announcementDate';
        candidates = candidates.filter(item => isWithinRange(item[targetKey], weekRange.startLabel, weekRange.endLabel));
    }
    if (monthRange) {
        const targetKey = intent.wantsBidding ? 'biddingDate' : 'announcementDate';
        candidates = candidates.filter(item => isWithinRange(item[targetKey], monthRange.startLabel, monthRange.endLabel));
    }

    const scored = candidates
        .map(item => ({ item, score: scoreItem(item, query, tokens, intent) }))
        .filter(entry => {
            if (tokens.length === 0) return true;
            return entry.score > 0 || intent.wantsBidding || intent.wantsAnnouncement || intent.wantsAwarded || intent.wantsOpen;
        })
        .sort((a, b) => b.score - a.score || b.item.announcementDate.localeCompare(a.item.announcementDate));

    const ranked = scored.map(entry => entry.item);

    if (intent.wantsBidding && (weekRange || monthRange)) {
        return ranked.sort((a, b) => (a.biddingDate || '9999-99-99').localeCompare(b.biddingDate || '9999-99-99')).slice(0, 12);
    }

    if (intent.wantsAnnouncement) {
        return ranked.sort((a, b) => b.announcementDate.localeCompare(a.announcementDate)).slice(0, 12);
    }

    return ranked.slice(0, intent.asksSpecificProject ? 5 : 10);
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

function formatItemLine(item: BiddingItem): string {
    return formatItemLineWithOptions(item, false);
}

function formatItemLineWithOptions(item: BiddingItem, includeWinnerFallback: boolean): string {
    const bits = [
        `${item.municipality} / ${item.title}`,
        `公告 ${item.announcementDate}`,
        item.biddingDate ? `開札 ${item.biddingDate}` : '',
        item.status,
        item.winningContractor ? `落札者 ${item.winningContractor}` : includeWinnerFallback ? '落札者 未取得' : '',
    ].filter(Boolean);
    return `- ${bits.join(' / ')}`;
}

function buildFollowups(intent: QueryIntent, matches: BiddingItem[]): string[] {
    const ideas = new Set<string>();
    if (matches[0]?.municipality) {
        ideas.add(`${matches[0].municipality}の受付中案件だけ見せて`);
    }
    if (intent.wantsBidding) {
        ideas.add('今月の公告案件も見せて');
    } else {
        ideas.add('今週の開札案件だけ教えて');
    }
    if (matches[0]?.title) {
        ideas.add(`${matches[0].title}を詳しく調べて`);
    }
    ideas.add('このサイトにない関連案件も探して');
    return Array.from(ideas).slice(0, 3);
}

function buildWinnerAnswer(matches: BiddingItem[]): string {
    const lines = matches
        .slice(0, 8)
        .map((item) => {
            const winner = item.winningContractor || '未取得';
            return `- ${item.title} / ${item.municipality} / ${item.biddingDate || item.announcementDate} / ゼネコン・落札者 ${winner}`;
        })
        .join('\n');
    return `各案件のゼネコン・落札者は次のとおりです。\n${lines}`;
}

function buildDeterministicAnswer(query: string, matches: BiddingItem[], history: ChatTurn[], context?: ChatContext): { answer: string; followups: string[] } | null {
    const intent = mergeIntentWithContext(inferIntent(query, history), context);
    if (matches.length === 0) return null;

    if (intent.wantsWinner && intent.wantsCarryOver) {
        return {
            answer: buildWinnerAnswer(matches),
            followups: buildFollowups(intent, matches),
        };
    }

    if ((intent.wantsThisWeek || intent.wantsLastWeek) && intent.wantsBidding) {
        const scope = intent.wantsLastWeek ? '先週' : '今週';
        const header = intent.wantsWinner ? `${scope}の開札案件は ${matches.length} 件あります。ゼネコン・落札者も併記します。` : `${scope}の開札案件は ${matches.length} 件あります。`;
        const lines = matches
            .slice(0, 8)
            .sort((a, b) => (a.biddingDate || '9999-99-99').localeCompare(b.biddingDate || '9999-99-99'))
            .map((item) => formatItemLineWithOptions(item, intent.wantsWinner))
            .join('\n');
        return {
            answer: `${header}\n${lines}`,
            followups: buildFollowups(intent, matches),
        };
    }

    if (intent.wantsBidding) {
        const header = intent.wantsWinner ? `開札関連で確認できる案件は ${matches.length} 件あります。ゼネコン・落札者も併記します。` : `開札関連で確認できる案件は ${matches.length} 件あります。`;
        const lines = matches
            .slice(0, 8)
            .sort((a, b) => (a.biddingDate || '9999-99-99').localeCompare(b.biddingDate || '9999-99-99'))
            .map((item) => formatItemLineWithOptions(item, intent.wantsWinner))
            .join('\n');
        return {
            answer: `${header}\n${lines}`,
            followups: buildFollowups(intent, matches),
        };
    }

    if (intent.wantsAnnouncement || intent.wantsThisMonth) {
        const scope = intent.wantsThisMonth ? '今月' : '直近';
        const lines = matches.slice(0, 8).map(formatItemLine).join('\n');
        return {
            answer: `${scope}の公告案件は次の ${Math.min(matches.length, 8)} 件です。\n${lines}`,
            followups: buildFollowups(intent, matches),
        };
    }

    if (intent.municipality && !intent.asksSpecificProject) {
        const lines = matches.slice(0, 8).map(formatItemLine).join('\n');
        return {
            answer: `${intent.municipality}で掲載中または掲載履歴のある案件は ${matches.length} 件あります。\n${lines}`,
            followups: buildFollowups(intent, matches),
        };
    }

    if (intent.asksSpecificProject) {
        const top = matches[0];
        const detailLines = [
            `案件名: ${top.title}`,
            `自治体: ${top.municipality}`,
            `種別: ${top.type}`,
            `公告日: ${top.announcementDate}`,
            `開札日: ${top.biddingDate || '未取得'}`,
            `状態: ${top.status}`,
            top.winningContractor ? `落札者: ${top.winningContractor}` : '',
            top.designFirm ? `設計事務所: ${top.designFirm}` : '',
            top.description ? `補足: ${top.description}` : '',
        ].filter(Boolean);

        if (matches.length > 1) {
            detailLines.push(`候補は他にも ${matches.length - 1} 件あります。必要なら絞り込みます。`);
        }

        return {
            answer: detailLines.join('\n'),
            followups: buildFollowups(intent, matches),
        };
    }

    const lines = matches.slice(0, 8).map(formatItemLine).join('\n');
    return {
        answer: `該当しそうな案件は ${matches.length} 件あります。\n${lines}`,
        followups: buildFollowups(intent, matches),
    };
}

function buildNoMatchAnswer(query: string, items: BiddingItem[], history: ChatTurn[], context?: ChatContext): { answer: string; followups: string[] } | null {
    const intent = mergeIntentWithContext(inferIntent(query, history), context);
    if (!intent.municipality) return null;

    const municipalityItems = items.filter((item) => item.municipality === intent.municipality);
    if (municipalityItems.length === 0) {
        return {
            answer: `${intent.municipality}の掲載案件は、現在のサイト内データでは 0 件です。収集漏れか、まだ掲載対象に入っていない可能性があります。`,
            followups: [
                `${intent.municipality}の案件をWebでも探して`,
                `${intent.municipality}の開札案件だけ確認して`,
                '他の自治体の新着案件を教えて',
            ],
        };
    }

    return {
        answer: `${intent.municipality}で条件に合う案件は、現在のサイト内データでは見つかりませんでした。掲載中の ${municipalityItems.length} 件から別条件で探すことはできます。`,
        followups: [
            `${intent.municipality}の最新案件を教えて`,
            `${intent.municipality}の開札案件だけ教えて`,
            `${intent.municipality}の設計案件だけ見せて`,
        ],
    };
}

function extractTextFromCandidate(response: GeminiRestResponse): string {
    return response.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim() || '';
}

function buildPrompt(query: string, localMatches: BiddingItem[], history: ChatTurn[]): string {
    const today = getNowInJst().toLocaleDateString('ja-JP');
    const weekRange = getThisWeekRangeJst();
    const lastWeekRange = getRelativeWeekRangeJst(-1);
    const recentHistory = history.slice(-6)
        .map(turn => `${turn.role === 'user' ? 'user' : 'assistant'}: ${turn.content}`)
        .join('\n');
    const localSummary = localMatches.length
        ? localMatches.map((item, index) =>
            `${index + 1}. ${item.title} / ${item.municipality} / 公告 ${item.announcementDate}${item.biddingDate ? ` / 開札 ${item.biddingDate}` : ''} / ${item.status}${item.winningContractor ? ` / 落札者 ${item.winningContractor}` : ''} / ${item.link}`,
        ).join('\n')
        : '該当するローカル案件は見つかっていません。';

    return `
あなたは奈良県の建築・設計系入札案件を案内するアシスタントです。
今日は ${today} です。今週は ${weekRange.startLabel} から ${weekRange.endLabel} です。
先週は ${lastWeekRange.startLabel} から ${lastWeekRange.endLabel} です。

回答ルール:
- まずローカル案件データを根拠に答える
- ローカルで足りない場合のみ、Google Search grounding の内容を補足する
- ローカルデータにあることを無視して別の結論を書かない
- 日付は具体的に YYYY-MM-DD で書く
- 落札者やゼネコンを聞かれたら、各案件ごとに分けて明記する
- 不確かな部分は「ローカル未確認」「Web上ではこう見える」と分ける
- 回答は簡潔にし、最初に結論、その後に箇条書き
- 最後に次に聞くと良い短い followups を 3 件まで返す

直近の会話:
${recentHistory || 'なし'}

今回の質問:
${query}

ローカル案件データ:
${localSummary}
`;
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
                temperature: 0.2,
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

export async function answerBiddingQuestion(query: string, history: ChatTurn[] = []): Promise<ChatResponsePayload> {
    const items = readBiddingItems();
    const localMatches = findLocalMatches(query, items, history);
    const intent = mergeIntentWithContext(inferIntent(query, history));
    const nextContext: ChatContext = {
        lastIntent: {
            municipality: intent.municipality,
            wantsBidding: intent.wantsBidding,
            wantsAnnouncement: intent.wantsAnnouncement,
            wantsAwarded: intent.wantsAwarded,
            wantsOpen: intent.wantsOpen,
            wantsThisWeek: intent.wantsThisWeek,
            wantsLastWeek: intent.wantsLastWeek,
            wantsThisMonth: intent.wantsThisMonth,
            wantsDesign: intent.wantsDesign,
            wantsConstruction: intent.wantsConstruction,
            wantsWinner: intent.wantsWinner,
        },
        lastResultIds: localMatches.map((item) => item.id),
        lastQuestion: query,
    };
    const localSources = buildLocalSources(localMatches);
    const deterministic = buildDeterministicAnswer(query, localMatches, history);
    const noMatchAnswer = buildNoMatchAnswer(query, items, history);
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
    return finalizeAnswer({
        query,
        history,
        localMatches,
        localSources,
        deterministic,
        noMatchAnswer,
        apiKey,
        context: undefined,
        nextContext,
    });
}

function finalizeAnswer({
    query,
    history,
    localMatches,
    localSources,
    deterministic,
    noMatchAnswer,
    apiKey,
    context,
    nextContext,
}: {
    query: string;
    history: ChatTurn[];
    localMatches: BiddingItem[];
    localSources: ChatSource[];
    deterministic: { answer: string; followups: string[] } | null;
    noMatchAnswer: { answer: string; followups: string[] } | null;
    apiKey: string;
    context?: ChatContext;
    nextContext: ChatContext;
}): Promise<ChatResponsePayload> | ChatResponsePayload {
    const intent = mergeIntentWithContext(inferIntent(query, history), context);
    if (deterministic && !intent.explicitWebSearch) {
        return {
            answer: deterministic.answer,
            sources: localSources,
            localMatches,
            followups: deterministic.followups,
            usedWebSearch: false,
            model: 'local-answer',
            context: nextContext,
        };
    }

    if (noMatchAnswer && !intent.explicitWebSearch) {
        return {
            answer: noMatchAnswer.answer,
            sources: [],
            localMatches,
            followups: noMatchAnswer.followups,
            usedWebSearch: false,
            model: 'local-answer',
            context: nextContext,
        };
    }

    if (!apiKey) {
        if (deterministic) {
            return {
                answer: deterministic.answer,
                sources: localSources,
                localMatches,
                followups: deterministic.followups,
                usedWebSearch: false,
                model: 'local-answer',
                context: nextContext,
            };
        }
        if (noMatchAnswer) {
            return {
                answer: noMatchAnswer.answer,
                sources: [],
                localMatches,
                followups: noMatchAnswer.followups,
                usedWebSearch: false,
                model: 'local-answer',
                context: nextContext,
            };
        }
        throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not set');
    }

    const modelName = getChatModelName();
    const shouldUseWebSearch = intent.explicitWebSearch || localMatches.length < 3;
    const prompt = buildPrompt(query, localMatches, history);
    return callGeminiChat(prompt, shouldUseWebSearch, modelName, apiKey).then((result) => {
        const rawText = extractTextFromCandidate(result);
        const parsed = JSON.parse(rawText) as { answer: string; followups?: string[] };
        const webSources = extractGroundedSources(result);

        return {
            answer: parsed.answer,
            sources: [...localSources, ...webSources],
            localMatches,
            followups: parsed.followups?.slice(0, 3) || buildFollowups(intent, localMatches),
            usedWebSearch: webSources.length > 0,
            model: modelName,
            context: nextContext,
        };
    });
}

export async function answerBiddingQuestionWithContext(
    query: string,
    history: ChatTurn[] = [],
    context?: ChatContext,
): Promise<ChatResponsePayload> {
    const items = readBiddingItems();
    const intent = mergeIntentWithContext(inferIntent(query, history), context);
    const localMatches = findLocalMatches(query, items, history, context);
    const localSources = buildLocalSources(localMatches);
    const deterministic = buildDeterministicAnswer(query, localMatches, history, context);
    const noMatchAnswer = buildNoMatchAnswer(query, items, history, context);
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
    const nextContext: ChatContext = {
        lastIntent: {
            municipality: intent.municipality,
            wantsBidding: intent.wantsBidding,
            wantsAnnouncement: intent.wantsAnnouncement,
            wantsAwarded: intent.wantsAwarded,
            wantsOpen: intent.wantsOpen,
            wantsThisWeek: intent.wantsThisWeek,
            wantsLastWeek: intent.wantsLastWeek,
            wantsThisMonth: intent.wantsThisMonth,
            wantsDesign: intent.wantsDesign,
            wantsConstruction: intent.wantsConstruction,
            wantsWinner: intent.wantsWinner,
        },
        lastResultIds: localMatches.map((item) => item.id),
        lastQuestion: query,
    };

    const result = finalizeAnswer({
        query,
        history,
        localMatches,
        localSources,
        deterministic,
        noMatchAnswer,
        apiKey,
        context,
        nextContext,
    });

    return await result;
}

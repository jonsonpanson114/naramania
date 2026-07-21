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
    webSearchStatus: 'not-requested' | 'used' | 'unavailable' | 'failed';
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

interface QueryIntentPayload {
    municipality?: string | null;
    wantsBidding?: boolean;
    wantsAnnouncement?: boolean;
    wantsAwarded?: boolean;
    wantsOpen?: boolean;
    wantsThisWeek?: boolean;
    wantsLastWeek?: boolean;
    wantsThisMonth?: boolean;
    wantsDesign?: boolean;
    wantsConstruction?: boolean;
    wantsWinner?: boolean;
    explicitWebSearch?: boolean;
    asksSpecificProject?: boolean;
    wantsCarryOver?: boolean;
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
const QUERY_INTENT_SCHEMA = {
    type: 'object',
    properties: {
        municipality: { type: 'string', nullable: true },
        wantsBidding: { type: 'boolean' },
        wantsAnnouncement: { type: 'boolean' },
        wantsAwarded: { type: 'boolean' },
        wantsOpen: { type: 'boolean' },
        wantsThisWeek: { type: 'boolean' },
        wantsLastWeek: { type: 'boolean' },
        wantsThisMonth: { type: 'boolean' },
        wantsDesign: { type: 'boolean' },
        wantsConstruction: { type: 'boolean' },
        wantsWinner: { type: 'boolean' },
        explicitWebSearch: { type: 'boolean' },
        asksSpecificProject: { type: 'boolean' },
        wantsCarryOver: { type: 'boolean' },
    },
    required: [
        'wantsBidding',
        'wantsAnnouncement',
        'wantsAwarded',
        'wantsOpen',
        'wantsThisWeek',
        'wantsLastWeek',
        'wantsThisMonth',
        'wantsDesign',
        'wantsConstruction',
        'wantsWinner',
        'explicitWebSearch',
        'asksSpecificProject',
        'wantsCarryOver',
    ],
};

const MUNICIPALITIES: Municipality[] = [
    '奈良県', '奈良市', '橿原市', '生駒市', '大和高田市', '大和郡山市',
    '葛城市', '五條市', '御所市', '天理市', '桜井市', '宇陀市', '田原本町',
    '広陵町', '香芝市', '川西町', '三宅町', '山添村', '平群町', '安堵町',
    '高取町', '斑鳩町', '三郷町', '王寺町', '大淀町',
];

const SEARCH_KEYWORDS = [
    '小学校', '中学校', '学校', 'こども園', '保育所', '幼稚園',
    'トイレ', '昇降口', '校舎', '体育館', '庁舎',
    '住宅', '団地', '公民館', '文化センター', '給食センター',
    '改修', '修繕', '新築', '解体', '除却', '耐震', '空調',
    '設計', '監理', '調査', '委託', '工事', '業務',
];

function getChatModelName(): string {
    return process.env.GOOGLE_GENERATIVE_AI_CHAT_MODEL || 'gemini-2.5-flash';
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

function normalizeProjectText(value: string): string {
    let normalized = normalizeText(stripQueryNoise(value))
        .replace(/[「」『』【】()（）!?！？:：,，.。・]/g, '')
        .replace(/\s+/g, '');
    let previous = '';
    while (previous !== normalized) {
        previous = normalized;
        normalized = normalized.replace(/(?:ありますか|あります|あるか|ある|ですか|です|について|に関して|は|って|の)$/u, '');
    }
    return normalized;
}

function stripQueryNoise(value: string): string {
    return value
        .replace(/を?(調べて|教えて|見せて|探して|確認して|詳しく|ください|お願い|お願いします)/g, ' ')
        .replace(/[?？]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
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
    const normalized = normalizeText(stripQueryNoise(query))
        .replace(/[「」『』【】()（）!?！？:：,，.。]/g, ' ')
        .trim();

    const tokens = normalized
        .split(/\s+/)
        .map(token => token.trim())
        .filter(token => token.length >= 2);

    if (normalized.length >= 6) {
        tokens.unshift(normalized);
    }

    const keywordTokens = SEARCH_KEYWORDS
        .filter(keyword => query.includes(keyword) || normalized.includes(normalizeText(keyword)))
        .map(normalizeText);

    return Array.from(new Set([...tokens, ...keywordTokens]));
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

function coerceMunicipality(value: string | null | undefined): Municipality | null {
    if (!value) return null;
    return inferMunicipality(value);
}

function looksLikeSpecificProject(query: string): boolean {
    if (query.length < 12) return false;
    if (/今週|今月|新着|最新|一覧|まとめ|だけ|全部|すべて|何件|どれ|どんな|見せて/.test(query)) {
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
        explicitWebSearch: /ネット|web|検索|見つからない|サイトにない|他にも|webでも|外でも/.test(fullQuery),
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

function buildIntentInterpreterPrompt(query: string, history: ChatTurn[], context?: ChatContext): string {
    const recentHistory = history.slice(-6)
        .map((turn) => `${turn.role === 'user' ? 'user' : 'assistant'}: ${turn.content}`)
        .join('\n');
    const previousContext = context?.lastIntent
        ? JSON.stringify({
            lastIntent: context.lastIntent,
            lastQuestion: context.lastQuestion || null,
            lastResultCount: context.lastResultIds?.length || 0,
        }, null, 2)
        : 'null';

    return `
あなたは奈良県の入札チャット向けの質問分類器です。
ユーザーの質問を、検索条件JSONに変換してください。

解釈ルール:
- 「それぞれ」「その中で」「前のやつ」「続けて」は wantsCarryOver=true
- 「ゼネコン」「元請け」「落札者」は wantsWinner=true
- 「今週」「先週」「今月」は期間条件として解釈
- 「開札」「締切」は wantsBidding=true
- 「公告」「新着」「最新」は wantsAnnouncement=true
- 自治体名は奈良県内の自治体に限る
- 不明なら municipality は null
- 個別案件の深掘りは asksSpecificProject=true

直近の会話:
${recentHistory || 'なし'}

前回コンテキスト:
${previousContext}

今回の質問:
${query}
`;
}

async function callGeminiJson<T>(prompt: string, schema: object, modelName: string, apiKey: string): Promise<T> {
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
                responseSchema: schema,
                temperature: 0.1,
            },
        }),
        cache: 'no-store',
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} ${errorText}`);
    }

    const result = await response.json() as GeminiRestResponse;
    return JSON.parse(extractTextFromCandidate(result)) as T;
}

function normalizeIntentPayload(payload: QueryIntentPayload, fallback: QueryIntent): QueryIntent {
    const municipality = coerceMunicipality(payload.municipality) ?? fallback.municipality;
    return mergeIntentWithContext({
        municipality,
        wantsBidding: payload.wantsBidding ?? fallback.wantsBidding,
        wantsAnnouncement: payload.wantsAnnouncement ?? fallback.wantsAnnouncement,
        wantsAwarded: payload.wantsAwarded ?? fallback.wantsAwarded,
        wantsOpen: payload.wantsOpen ?? fallback.wantsOpen,
        wantsThisWeek: payload.wantsThisWeek ?? fallback.wantsThisWeek,
        wantsLastWeek: payload.wantsLastWeek ?? fallback.wantsLastWeek,
        wantsThisMonth: payload.wantsThisMonth ?? fallback.wantsThisMonth,
        wantsDesign: payload.wantsDesign ?? fallback.wantsDesign,
        wantsConstruction: payload.wantsConstruction ?? fallback.wantsConstruction,
        wantsWinner: payload.wantsWinner ?? fallback.wantsWinner,
        explicitWebSearch: payload.explicitWebSearch ?? fallback.explicitWebSearch,
        asksSpecificProject: payload.asksSpecificProject ?? fallback.asksSpecificProject,
        wantsCarryOver: payload.wantsCarryOver ?? fallback.wantsCarryOver,
    });
}

async function interpretIntent(query: string, history: ChatTurn[], context?: ChatContext, apiKey?: string): Promise<QueryIntent> {
    const heuristicIntent = mergeIntentWithContext(inferIntent(query, history), context);
    if (!apiKey) return heuristicIntent;

    try {
        const payload = await callGeminiJson<QueryIntentPayload>(
            buildIntentInterpreterPrompt(query, history, context),
            QUERY_INTENT_SCHEMA,
            getChatModelName(),
            apiKey,
        );
        return normalizeIntentPayload(payload, heuristicIntent);
    } catch {
        return heuristicIntent;
    }
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
    const normalizedQuery = normalizeText(stripQueryNoise(query));
    const normalizedTitle = normalizeText(item.title);
    if (normalizedQuery && haystack.includes(normalizedQuery)) score += 20;
    if (normalizedQuery && normalizedTitle.includes(normalizedQuery)) score += 24;
    if (normalizedQuery && normalizedQuery.includes(normalizedTitle)) score += 32;

    for (const token of tokens) {
        if (normalizedTitle.includes(token)) score += 10;
        else if (haystack.includes(token)) score += 4;
    }

    if (intent.asksSpecificProject) {
        const longTokens = tokens.filter((token) => token.length >= 6);
        const matchedLongTokens = longTokens.filter((token) => normalizedTitle.includes(token)).length;
        score += matchedLongTokens * 8;
    }

    if (intent.municipality && item.municipality === intent.municipality) score += 8;
    if (intent.wantsBidding && item.biddingDate) score += 6;
    if (intent.wantsAwarded && item.status === '落札') score += 5;
    if (intent.wantsOpen && item.status === '受付中') score += 5;
    if ((intent.wantsAwarded || intent.wantsWinner) && item.status === '落札') score += 14;
    if ((intent.wantsAwarded || intent.wantsWinner) && item.winningContractor) score += 16;
    if ((intent.wantsAwarded || intent.wantsWinner) && item.status === '不調') score += 8;
    if (intent.wantsDesign && item.type === 'コンサル') score += 4;
    if (intent.wantsConstruction && (item.type === '建築' || item.type === '工事')) score += 4;

    return score;
}

function isWithinRange(dateValue: string | undefined, startLabel: string, endLabel: string): boolean {
    if (!dateValue) return false;
    return dateValue >= startLabel && dateValue <= endLabel;
}

function sortBiddingMatches(matches: BiddingItem[], intent: QueryIntent): BiddingItem[] {
    const direction = (intent.wantsThisWeek || intent.wantsLastWeek || intent.wantsThisMonth) ? 1 : -1;
    return [...matches].sort((a, b) => {
        const aDate = a.biddingDate || '0000-00-00';
        const bDate = b.biddingDate || '0000-00-00';
        return direction * aDate.localeCompare(bDate);
    });
}

function findStrongProjectMatches(query: string, candidates: BiddingItem[]): BiddingItem[] {
    const normalizedQuery = normalizeProjectText(query);
    if (normalizedQuery.length < 8) return [];

    const exactOrContained = candidates.filter((item) => {
        const normalizedTitle = normalizeProjectText(item.title);
        if (normalizedTitle.length < 8) return false;
        return normalizedQuery.includes(normalizedTitle) || normalizedTitle.includes(normalizedQuery);
    });

    if (exactOrContained.length > 0) {
        return exactOrContained.sort((a, b) => {
            const byLength = Math.abs(normalizeProjectText(a.title).length - normalizedQuery.length)
                - Math.abs(normalizeProjectText(b.title).length - normalizedQuery.length);
            if (byLength !== 0) return byLength;
            return b.announcementDate.localeCompare(a.announcementDate);
        });
    }

    return [];
}

function findLocalMatches(query: string, items: BiddingItem[], intent: QueryIntent, context?: ChatContext): BiddingItem[] {
    const tokens = tokenizeQuery(query);
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
    if (intent.wantsAwarded && !intent.asksSpecificProject) {
        candidates = candidates.filter(item => item.status === '落札');
    }
    if (intent.wantsOpen && !intent.asksSpecificProject) {
        candidates = candidates.filter(item => item.status === '受付中');
    }
    if (intent.wantsDesign && !intent.wantsConstruction && !intent.asksSpecificProject) {
        candidates = candidates.filter(item => item.type === 'コンサル' || /設計|監理/.test(item.title));
    }
    if (intent.wantsConstruction && !intent.wantsDesign && !intent.asksSpecificProject) {
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

    if (intent.asksSpecificProject) {
        const strongMatches = findStrongProjectMatches(query, candidates);
        if (strongMatches.length > 0) {
            return strongMatches.slice(0, 3);
        }
    }

    const scored = candidates
        .map(item => ({ item, score: scoreItem(item, query, tokens, intent) }))
        .filter(entry => {
            if (tokens.length === 0) return true;
            return entry.score > 0 || intent.wantsBidding || intent.wantsAnnouncement || intent.wantsAwarded || intent.wantsOpen;
        })
        .sort((a, b) => b.score - a.score || b.item.announcementDate.localeCompare(a.item.announcementDate));

    const ranked = scored.map(entry => entry.item);

    if (intent.wantsBidding && !intent.asksSpecificProject) {
        return sortBiddingMatches(ranked, intent).slice(0, 12);
    }

    if (intent.wantsAnnouncement) {
        return ranked.sort((a, b) => b.announcementDate.localeCompare(a.announcementDate)).slice(0, 12);
    }

    return ranked.slice(0, intent.asksSpecificProject ? 3 : 10);
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

function buildSpecificProjectAnswer(intent: QueryIntent, top: BiddingItem, totalMatches: number): { answer: string; followups: string[] } {
    const detailLines = [
        `案件名: ${top.title}`,
        `自治体: ${top.municipality}`,
        `種別: ${top.type}`,
        `公告日: ${top.announcementDate}`,
        `開札日: ${top.biddingDate || '未取得'}`,
        `状態: ${top.status}`,
    ];

    if (intent.wantsWinner) {
        detailLines.push(`落札者: ${top.winningContractor || '未取得'}`);
    } else if (top.winningContractor) {
        detailLines.push(`落札者: ${top.winningContractor}`);
    }

    if (intent.wantsBidding) {
        if (top.status === '落札' || top.status === '不調' || top.status === '受付終了') {
            detailLines.push('判定: この案件は開札済みとして扱える状態です。');
        } else if (top.biddingDate) {
            detailLines.push(`判定: まだ開札結果は未確認です。開札予定日は ${top.biddingDate} です。`);
        } else {
            const today = formatDate(getNowInJst());
            const staleHint = top.announcementDate && top.announcementDate < today
                ? '公告日から時間が経っているため、収集データが古い可能性があります。'
                : '';
            detailLines.push(`判定: 開札日・開札結果はローカルデータで未取得です。${staleHint}`);
        }
    }

    if (top.designFirm) {
        detailLines.push(`設計事務所: ${top.designFirm}`);
    }
    if (top.description) {
        detailLines.push(`補足: ${top.description}`);
    }
    if (totalMatches > 1) {
        detailLines.push(`候補は他にも ${totalMatches - 1} 件あります。必要なら絞り込みます。`);
    }

    return {
        answer: detailLines.join('\n'),
        followups: buildFollowups(intent, [top]),
    };
}

function buildDeterministicAnswer(intent: QueryIntent, matches: BiddingItem[]): { answer: string; followups: string[] } | null {
    if (matches.length === 0) return null;

    if (intent.asksSpecificProject) {
        return buildSpecificProjectAnswer(intent, matches[0], matches.length);
    }

    if (intent.wantsWinner && intent.wantsCarryOver) {
        return {
            answer: buildWinnerAnswer(matches),
            followups: buildFollowups(intent, matches),
        };
    }

    if ((intent.wantsThisWeek || intent.wantsLastWeek) && intent.wantsBidding) {
        const scope = intent.wantsLastWeek ? '先週' : '今週';
        const header = intent.wantsWinner ? `${scope}の開札案件は ${matches.length} 件あります。ゼネコン・落札者も併記します。` : `${scope}の開札案件は ${matches.length} 件あります。`;
        const lines = sortBiddingMatches(matches, intent)
            .slice(0, 8)
            .map((item) => formatItemLineWithOptions(item, intent.wantsWinner))
            .join('\n');
        return {
            answer: `${header}\n${lines}`,
            followups: buildFollowups(intent, matches),
        };
    }

    if (intent.wantsBidding) {
        const header = intent.wantsWinner ? `開札関連で確認できる案件は ${matches.length} 件あります。ゼネコン・落札者も併記します。` : `開札関連で確認できる案件は ${matches.length} 件あります。`;
        const lines = sortBiddingMatches(matches, intent)
            .slice(0, 8)
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

    const lines = matches.slice(0, 8).map(formatItemLine).join('\n');
    return {
        answer: `該当しそうな案件は ${matches.length} 件あります。\n${lines}`,
        followups: buildFollowups(intent, matches),
    };
}

function buildNoMatchAnswer(intent: QueryIntent, items: BiddingItem[]): { answer: string; followups: string[] } | null {
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

function buildGenericLocalFallback(query: string, items: BiddingItem[]): { answer: string; followups: string[] } {
    const latestItems = items.slice(0, 5);
    const lines = latestItems.length > 0
        ? latestItems.map(formatItemLine).join('\n')
        : '- ローカル案件データがまだありません。';

    return {
        answer: [
            `外部AIなしでローカル案件データから回答します。質問「${query}」に対して完全一致は出せませんでしたが、直近案件は次のとおりです。`,
            lines,
            '自治体名、案件名、または「今週の開札」「五條市の学校改修」のように条件を足すと絞り込みやすくなります。',
        ].join('\n'),
        followups: [
            '今週の開札案件だけ教えて',
            '五條市の案件だけ見せて',
            '奈良県の最新案件を教えて',
        ],
    };
}

function prependWebSearchNotice(
    answer: string,
    status: 'unavailable' | 'failed',
    intent: QueryIntent,
): string {
    if (!intent.explicitWebSearch) return answer;

    const notice = status === 'unavailable'
        ? 'Web補足も求められましたが、この実行では外部AI/APIキーが使えないため、サイト内データだけで回答します。'
        : 'Web補足も試みましたが、この実行では外部応答が不安定だったため、サイト内データだけで回答します。';

    return `${notice}\n${answer}`;
}

function extractTextFromCandidate(response: GeminiRestResponse): string {
    return response.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim() || '';
}

/**
 * Geminiのチャット応答をJSONとして寛容に解釈する。
 * responseSchemaを使えるモードでは素直にJSONが返るが、google_search併用モードでは
 * コードフェンス付きや前後に余計な文が混じることがある。JSONが取れなければ
 * 本文そのものを answer として扱う。
 */
function parseChatJson(rawText: string): { answer?: string; followups?: string[] } {
    const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fenced ? fenced[1] : rawText).trim();
    try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object' && typeof parsed.answer === 'string') {
            return parsed as { answer?: string; followups?: string[] };
        }
    } catch {
        // JSONでなければ本文をそのまま回答として使う
    }
    return { answer: rawText.trim() };
}

function buildPrompt(query: string, localMatches: BiddingItem[], history: ChatTurn[], enforceJsonInPrompt = false): string {
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
${enforceJsonInPrompt ? `
出力形式(重要): 説明文やコードフェンス(\`\`\`)を付けず、次のJSONオブジェクトだけを返してください。
{"answer": "<回答本文>", "followups": ["<次に聞くと良い短い質問1>", "<質問2>", "<質問3>"]}
` : ''}`;
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
            // Gemini は google_search ツールと responseSchema(JSON構造化出力)を
            // 同時に使えず 400 になる。検索を使うときはスキーマを外し、
            // 代わりにプロンプトでJSON形式を指示する。
            generationConfig: useGoogleSearch
                ? { temperature: 0.2 }
                : {
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
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
    const intent = await interpretIntent(query, history, undefined, apiKey);
    const localMatches = findLocalMatches(query, items, intent);
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
    const deterministic = buildDeterministicAnswer(intent, localMatches);
    const noMatchAnswer = buildNoMatchAnswer(intent, items);
    return finalizeAnswer({
        query,
        history,
        items,
        localMatches,
        localSources,
        deterministic,
        noMatchAnswer,
        intent,
        apiKey,
        nextContext,
    });
}

function finalizeAnswer({
    query,
    history,
    items,
    localMatches,
    localSources,
    deterministic,
    noMatchAnswer,
    intent,
    apiKey,
    nextContext,
}: {
    query: string;
    history: ChatTurn[];
    items: BiddingItem[];
    localMatches: BiddingItem[];
    localSources: ChatSource[];
    deterministic: { answer: string; followups: string[] } | null;
    noMatchAnswer: { answer: string; followups: string[] } | null;
    intent: QueryIntent;
    apiKey: string;
    nextContext: ChatContext;
}): Promise<ChatResponsePayload> | ChatResponsePayload {
    if (deterministic && !intent.explicitWebSearch) {
        return {
            answer: deterministic.answer,
            sources: localSources,
            localMatches,
            followups: deterministic.followups,
            usedWebSearch: false,
            webSearchStatus: 'not-requested',
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
            webSearchStatus: 'not-requested',
            model: 'local-answer',
            context: nextContext,
        };
    }

    if (!apiKey) {
        if (deterministic) {
            return {
                answer: prependWebSearchNotice(deterministic.answer, 'unavailable', intent),
                sources: localSources,
                localMatches,
                followups: deterministic.followups,
                usedWebSearch: false,
                webSearchStatus: intent.explicitWebSearch ? 'unavailable' : 'not-requested',
                model: 'local-answer',
                context: nextContext,
            };
        }
        if (noMatchAnswer) {
            return {
                answer: prependWebSearchNotice(noMatchAnswer.answer, 'unavailable', intent),
                sources: [],
                localMatches,
                followups: noMatchAnswer.followups,
                usedWebSearch: false,
                webSearchStatus: intent.explicitWebSearch ? 'unavailable' : 'not-requested',
                model: 'local-answer',
                context: nextContext,
            };
        }
        const fallback = buildGenericLocalFallback(query, items);
        return {
            answer: prependWebSearchNotice(fallback.answer, 'unavailable', intent),
            sources: localSources,
            localMatches,
            followups: fallback.followups,
            usedWebSearch: false,
            webSearchStatus: intent.explicitWebSearch ? 'unavailable' : 'not-requested',
            model: 'local-fallback',
            context: nextContext,
        };
    }

    const modelName = getChatModelName();
    const shouldUseWebSearch = intent.explicitWebSearch || localMatches.length < 3;
    const prompt = buildPrompt(query, localMatches, history, shouldUseWebSearch);
    return callGeminiChat(prompt, shouldUseWebSearch, modelName, apiKey)
        .then((result) => {
            const rawText = extractTextFromCandidate(result);
            if (!rawText) {
                throw new Error('Gemini returned an empty response');
            }

            const parsed = parseChatJson(rawText);
            if (!parsed.answer?.trim()) {
                throw new Error('Gemini response did not include an answer');
            }

            const webSources = extractGroundedSources(result);

            return {
                answer: parsed.answer,
                sources: [...localSources, ...webSources],
                localMatches,
                followups: parsed.followups?.slice(0, 3) || buildFollowups(intent, localMatches),
                usedWebSearch: webSources.length > 0,
                webSearchStatus: (webSources.length > 0 ? 'used' : 'not-requested') as ChatResponsePayload['webSearchStatus'],
                model: modelName,
                context: nextContext,
            };
        })
        .catch(() => {
            const fallback = deterministic
                || noMatchAnswer
                || buildGenericLocalFallback(query, items);

            return {
                answer: prependWebSearchNotice(fallback.answer, 'failed', intent),
                sources: localSources,
                localMatches,
                followups: fallback.followups,
                usedWebSearch: false,
                webSearchStatus: intent.explicitWebSearch || shouldUseWebSearch ? 'failed' : 'not-requested',
                model: 'local-fallback',
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
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
    const intent = await interpretIntent(query, history, context, apiKey);
    const localMatches = findLocalMatches(query, items, intent, context);
    const localSources = buildLocalSources(localMatches);
    const deterministic = buildDeterministicAnswer(intent, localMatches);
    const noMatchAnswer = buildNoMatchAnswer(intent, items);
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
        items,
        localMatches,
        localSources,
        deterministic,
        noMatchAnswer,
        intent,
        apiKey,
        nextContext,
    });

    return await result;
}

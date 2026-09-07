import { NextRequest, NextResponse } from 'next/server';
import { answerBiddingQuestionWithContext, ChatContext, ChatTurn } from '@/services/chat_service';

/**
 * このAPIは1リクエストごとにGeminiを呼ぶため、無防備だと第三者に
 * 利用枠を消費されうる。認証は入れない(誰でも使える公開サイトのため)代わりに、
 * 「1回あたりのコスト」と「単位時間あたりの回数」の両方に上限を設ける。
 */

/** 質問文の上限。長文をそのまま渡すと1回のトークン消費が跳ね上がる */
const MAX_QUESTION_LENGTH = 400;
/** 履歴1件あたりの上限。回答文が長くなるため質問より緩めにする */
const MAX_HISTORY_CONTENT_LENGTH = 2000;
/** 送信できる履歴の件数 */
const MAX_HISTORY_TURNS = 8;
/** リクエストボディ全体の上限(バイト) */
const MAX_BODY_BYTES = 32 * 1024;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 12;

/**
 * IP単位の簡易レート制限。
 *
 * サーバーレスではインスタンスごとに状態が分かれ、再起動で消えるため
 * 厳密な制限にはならない。それでも無制限に叩かれる状態よりは明確に良く、
 * 外部サービス(Redis等)を増やさずに入れられる。
 * 恒久的に守りたくなったら、この関数を共有ストア方式へ差し替える。
 */
const requestLog = new Map<string, number[]>();

function getClientKey(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return request.headers.get('x-real-ip') || 'unknown';
}

function isRateLimited(key: string, now = Date.now()): boolean {
    const recent = (requestLog.get(key) || []).filter(at => now - at < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
        requestLog.set(key, recent);
        return true;
    }
    recent.push(now);
    requestLog.set(key, recent);

    // 放置するとメモリが増え続けるため、区切りのよいところで古い記録を捨てる
    if (requestLog.size > 1000) {
        for (const [entryKey, times] of requestLog) {
            if (times.every(at => now - at >= RATE_LIMIT_WINDOW_MS)) requestLog.delete(entryKey);
        }
    }
    return false;
}

export async function POST(request: NextRequest) {
    const clientKey = getClientKey(request);
    if (isRateLimited(clientKey)) {
        return NextResponse.json(
            { error: 'rate_limited', message: '短時間に質問が集中しています。少し待ってからお試しください。' },
            { status: 429, headers: { 'Retry-After': String(RATE_LIMIT_WINDOW_MS / 1000) } },
        );
    }

    try {
        const raw = await request.text();
        if (raw.length > MAX_BODY_BYTES) {
            return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
        }

        const body = JSON.parse(raw) as { question?: unknown; history?: unknown; context?: unknown };
        const question = typeof body.question === 'string' ? body.question.trim() : '';
        const history = Array.isArray(body.history)
            ? body.history
                .filter((turn: unknown): turn is ChatTurn => {
                    if (!turn || typeof turn !== 'object') return false;
                    const candidate = turn as Partial<ChatTurn>;
                    return (
                        (candidate.role === 'user' || candidate.role === 'assistant') &&
                        typeof candidate.content === 'string'
                    );
                })
                .slice(-MAX_HISTORY_TURNS)
                // 履歴は利用者が自由に送れるため、ここでも長さを切る。
                // 切らないと履歴経由でいくらでもプロンプトを膨らませられる。
                .map(turn => ({ ...turn, content: turn.content.slice(0, MAX_HISTORY_CONTENT_LENGTH) }))
            : [];
        const context = body.context && typeof body.context === 'object'
            ? body.context as ChatContext
            : undefined;

        if (!question) {
            return NextResponse.json({ error: 'question is required' }, { status: 400 });
        }
        if (question.length > MAX_QUESTION_LENGTH) {
            return NextResponse.json(
                {
                    error: 'question_too_long',
                    message: `質問は${MAX_QUESTION_LENGTH}文字以内でお願いします。`,
                },
                { status: 400 },
            );
        }

        const result = await answerBiddingQuestionWithContext(question, history, context);
        return NextResponse.json(result);
    } catch (error) {
        // 例外の中身をそのまま返すと、内部のパスやモデル名などが外に出る。
        // 調査に必要な情報はサーバー側のログにだけ残す。
        console.error('[api/chat] failed:', error instanceof Error ? error.message : error);
        return NextResponse.json({ error: 'chat_failed' }, { status: 500 });
    }
}

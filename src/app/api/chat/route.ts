import { NextRequest, NextResponse } from 'next/server';
import { answerBiddingQuestion, ChatTurn } from '@/services/chat_service';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json() as { question?: unknown; history?: unknown };
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
                .slice(-8)
            : [];

        if (!question) {
            return NextResponse.json({ error: 'question is required' }, { status: 400 });
        }

        const result = await answerBiddingQuestion(question, history);
        return NextResponse.json(result);
    } catch (error) {
        return NextResponse.json(
            {
                error: 'chat_failed',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 },
        );
    }
}

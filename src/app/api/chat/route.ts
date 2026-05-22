import { NextRequest, NextResponse } from 'next/server';
import { answerBiddingQuestion, ChatTurn } from '@/services/chat_service';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const question = typeof body.question === 'string' ? body.question.trim() : '';
        const history = Array.isArray(body.history)
            ? body.history
                .filter((turn): turn is ChatTurn =>
                    turn &&
                    (turn.role === 'user' || turn.role === 'assistant') &&
                    typeof turn.content === 'string',
                )
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

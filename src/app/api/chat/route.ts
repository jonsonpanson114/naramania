import { NextRequest, NextResponse } from 'next/server';
import { answerBiddingQuestion } from '@/services/chat_service';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const question = typeof body.question === 'string' ? body.question.trim() : '';

        if (!question) {
            return NextResponse.json({ error: 'question is required' }, { status: 400 });
        }

        const result = await answerBiddingQuestion(question);
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

import { NextRequest, NextResponse } from 'next/server';
import { extractBiddingInfoFromText } from '@/services/gemini_service';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { text } = body;

        if (!text) {
            return NextResponse.json({ error: 'No text provided' }, { status: 400 });
        }

        const result = await extractBiddingInfoFromText(text);

        if (result) {
            return NextResponse.json({
                success: true,
                data: result,
                analyzedAt: new Date().toISOString(),
            });
        } else {
            return NextResponse.json({ error: 'Analysis failed - check API key' }, { status: 500 });
        }
    } catch (error) {
        return NextResponse.json({ error: 'Analysis failed', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}

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
        console.error('Analyze API Error:', error);
        return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
    }
}

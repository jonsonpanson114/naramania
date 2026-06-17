import { NextResponse } from 'next/server';
import { fetchAllNews } from '@/services/news_service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
    try {
        const news = await fetchAllNews();
        return NextResponse.json(news, {
            headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' },
        });
    } catch (error) {
        console.warn('[News] API error:', error instanceof Error ? error.message : String(error));
        return NextResponse.json([], {
            headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
        });
    }
}

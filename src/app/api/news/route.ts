import { NextResponse } from 'next/server';
import { fetchAllNews } from '@/services/news_service';

// 15分キャッシュ
export const revalidate = 900;

export async function GET() {
    try {
        const news = await fetchAllNews();
        return NextResponse.json(news, {
            headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' },
        });
    } catch (error) {
        return NextResponse.json([], { status: 500, error: error instanceof Error ? error.message : 'Unknown error' });
    }
}

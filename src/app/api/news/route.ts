import { NextResponse } from 'next/server';
import { loadNewsStore } from '@/lib/news_store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
    return NextResponse.json(loadNewsStore().items, {
        headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' },
    });
}

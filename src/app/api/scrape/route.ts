import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST() {
    try {
        // For now, read existing data. In future, run scrapers here.
        const jsonPath = path.join(process.cwd(), 'scraper_result.json');

        if (!fs.existsSync(jsonPath)) {
            return NextResponse.json({ error: 'No data file found' }, { status: 404 });
        }

        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

        return NextResponse.json({
            success: true,
            count: data.length,
            items: data,
            scrapedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Scrape API Error:', error);
        return NextResponse.json({ error: 'Scraping failed' }, { status: 500 });
    }
}

export async function GET() {
    try {
        const jsonPath = path.join(process.cwd(), 'scraper_result.json');

        if (!fs.existsSync(jsonPath)) {
            return NextResponse.json({ items: [], count: 0 });
        }

        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

        return NextResponse.json({
            items: data,
            count: data.length,
            lastUpdated: fs.statSync(jsonPath).mtime.toISOString(),
        });
    } catch (error) {
        console.error('Scrape GET Error:', error);
        return NextResponse.json({ error: 'Failed to load data' }, { status: 500 });
    }
}

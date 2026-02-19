/**
 * bulk_scrape.ts
 * 
 * Reliable bulk scraper for Nara bidding data.
 * Uses fetch + cheerio for simple HTML pages (no Playwright needed).
 * Targets the official listing pages of each municipality.
 */
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import fs from 'fs';

interface ScrapedItem {
    id: string;
    municipality: string;
    title: string;
    type: string;
    announcementDate: string;
    biddingDate?: string;
    link: string;
    status: string;
    winningContractor?: string;
    designFirm?: string;
    estimatedPrice?: string;
    constructionPeriod?: string;
}

// --- Nara Prefecture Portal ---
async function scrapeNaraPref(): Promise<ScrapedItem[]> {
    const items: ScrapedItem[] = [];
    const url = 'https://www.pref.nara.jp/10553.htm';

    try {
        console.log('[奈良県] Fetching portal page...');
        const res = await fetch(url);
        const html = await res.text();
        const $ = cheerio.load(html);

        // Find all links on the page
        $('a').each((_, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href') || '';

            // Look for bidding-related links
            if (text && (
                text.includes('工事') || text.includes('入札') || text.includes('公告') ||
                text.includes('測量') || text.includes('コンサル') || text.includes('委託') ||
                text.includes('開札') || text.includes('結果')
            ) && text.length > 5 && text.length < 100) {
                const isResult = text.includes('結果') || text.includes('開札');
                const fullUrl = href.startsWith('http') ? href : `https://www.pref.nara.jp${href}`;

                items.push({
                    id: crypto.randomUUID(),
                    municipality: '奈良県',
                    title: text,
                    type: guessType(text),
                    announcementDate: new Date().toISOString().split('T')[0],
                    link: fullUrl,
                    status: isResult ? '落札' : '受付中',
                });
            }
        });
        console.log(`[奈良県] Found ${items.length} items from portal.`);
    } catch (e) {
        console.error('[奈良県] Error:', e);
    }
    return items;
}

// --- Nara Prefecture Sub-pages (construction categories) ---
async function scrapeNaraPrefSubPages(): Promise<ScrapedItem[]> {
    const items: ScrapedItem[] = [];
    const subUrls = [
        'https://www.pref.nara.jp/2693.htm',   // 建設工事
        'https://www.pref.nara.jp/2695.htm',   // 測量・コンサル
        'https://www.pref.nara.jp/1756.htm',   // 入札結果 general
    ];

    for (const url of subUrls) {
        try {
            console.log(`[奈良県/sub] Fetching ${url}...`);
            const res = await fetch(url);
            const html = await res.text();
            const $ = cheerio.load(html);

            $('a').each((_, el) => {
                const text = $(el).text().trim();
                const href = $(el).attr('href') || '';

                if (text && text.length > 8 && text.length < 120 && (
                    text.includes('令和') || text.includes('平成') ||
                    text.includes('工事') || text.includes('業務') ||
                    text.includes('公告') || text.includes('結果')
                )) {
                    const isResult = text.includes('結果') || text.includes('開札');
                    const fullUrl = href.startsWith('http') ? href : `https://www.pref.nara.jp${href}`;

                    // Dedup by title
                    if (!items.find(i => i.title === text)) {
                        items.push({
                            id: crypto.randomUUID(),
                            municipality: '奈良県',
                            title: text,
                            type: guessType(text),
                            announcementDate: extractDate(text) || new Date().toISOString().split('T')[0],
                            link: fullUrl,
                            status: isResult ? '落札' : '受付中',
                        });
                    }
                }
            });
        } catch (e) {
            console.error(`[奈良県/sub] Error fetching ${url}:`, e);
        }
    }
    console.log(`[奈良県/sub] Found ${items.length} items from sub-pages.`);
    return items;
}

// --- Nara City ---
async function scrapeNaraCity(): Promise<ScrapedItem[]> {
    const items: ScrapedItem[] = [];
    const urls = [
        'https://www.city.nara.lg.jp/site/nyusatu-keiyaku/list339-847.html',
        'https://www.city.nara.lg.jp/site/nyusatu-keiyaku/',
    ];

    for (const url of urls) {
        try {
            console.log(`[奈良市] Fetching ${url}...`);
            const res = await fetch(url);
            const html = await res.text();
            const $ = cheerio.load(html);

            $('a').each((_, el) => {
                const text = $(el).text().trim();
                const href = $(el).attr('href') || '';

                if (text && text.length > 8 && text.length < 120 && (
                    text.includes('工事') || text.includes('入札') || text.includes('公告') ||
                    text.includes('測量') || text.includes('コンサル') || text.includes('委託') ||
                    text.includes('開札') || text.includes('結果') || text.includes('建築') ||
                    text.includes('令和') || text.includes('発注')
                )) {
                    const isResult = text.includes('結果') || text.includes('開札');
                    const fullUrl = href.startsWith('http') ? href : `https://www.city.nara.lg.jp${href}`;

                    if (!items.find(i => i.title === text)) {
                        items.push({
                            id: crypto.randomUUID(),
                            municipality: '奈良市',
                            title: text,
                            type: guessType(text),
                            announcementDate: extractDate(text) || new Date().toISOString().split('T')[0],
                            link: fullUrl,
                            status: isResult ? '落札' : '受付中',
                        });
                    }
                }
            });
        } catch (e) {
            console.error(`[奈良市] Error:`, e);
        }
    }
    console.log(`[奈良市] Found ${items.length} items.`);
    return items;
}

// --- Kashihara City ---
async function scrapeKashihara(): Promise<ScrapedItem[]> {
    const items: ScrapedItem[] = [];
    const url = 'https://www.city.kashihara.nara.jp/soshiki/1033/1041.html';

    try {
        console.log('[橿原市] Fetching...');
        const res = await fetch(url);
        const html = await res.text();
        const $ = cheerio.load(html);

        $('a').each((_, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href') || '';

            if (text && text.length > 8 && text.length < 120 && (
                text.includes('工事') || text.includes('入札') || text.includes('公告') ||
                text.includes('結果') || text.includes('令和') || text.includes('発注')
            )) {
                const isResult = text.includes('結果') || text.includes('開札');
                const fullUrl = href.startsWith('http') ? href : `https://www.city.kashihara.nara.jp${href}`;

                if (!items.find(i => i.title === text)) {
                    items.push({
                        id: crypto.randomUUID(),
                        municipality: '橿原市',
                        title: text,
                        type: guessType(text),
                        announcementDate: extractDate(text) || new Date().toISOString().split('T')[0],
                        link: fullUrl,
                        status: isResult ? '落札' : '受付中',
                    });
                }
            }
        });
        console.log(`[橿原市] Found ${items.length} items.`);
    } catch (e) {
        console.error('[橿原市] Error:', e);
    }
    return items;
}

// --- Ikoma City ---
async function scrapeIkoma(): Promise<ScrapedItem[]> {
    const items: ScrapedItem[] = [];
    const url = 'https://www.city.ikoma.lg.jp/0000000216.html';

    try {
        console.log('[生駒市] Fetching...');
        const res = await fetch(url);
        const html = await res.text();
        const $ = cheerio.load(html);

        $('a').each((_, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href') || '';

            if (text && text.length > 8 && text.length < 120 && (
                text.includes('工事') || text.includes('入札') || text.includes('公告') ||
                text.includes('結果') || text.includes('令和') || text.includes('発注')
            )) {
                const isResult = text.includes('結果') || text.includes('開札');
                const fullUrl = href.startsWith('http') ? href : `https://www.city.ikoma.lg.jp${href}`;

                if (!items.find(i => i.title === text)) {
                    items.push({
                        id: crypto.randomUUID(),
                        municipality: '生駒市',
                        title: text,
                        type: guessType(text),
                        announcementDate: extractDate(text) || new Date().toISOString().split('T')[0],
                        link: fullUrl,
                        status: isResult ? '落札' : '受付中',
                    });
                }
            }
        });
        console.log(`[生駒市] Found ${items.length} items.`);
    } catch (e) {
        console.error('[生駒市] Error:', e);
    }
    return items;
}

// --- Utilities ---
function guessType(text: string): string {
    if (text.includes('測量') || text.includes('コンサル')) return 'コンサル';
    if (text.includes('委託')) return '委託';
    if (text.includes('建築')) return '建築';
    if (text.includes('工事')) return '建築';
    return 'その他';
}

function extractDate(text: string): string | null {
    // Try to extract 令和X年 pattern
    const match = text.match(/令和(\d+)年/);
    if (match) {
        const year = 2018 + parseInt(match[1]);
        const monthMatch = text.match(/(\d+)月/);
        const month = monthMatch ? monthMatch[1].padStart(2, '0') : '01';
        const dayMatch = text.match(/(\d+)日/);
        const day = dayMatch ? dayMatch[1].padStart(2, '0') : '01';
        return `${year}-${month}-${day}`;
    }
    return null;
}

// --- Main ---
async function main() {
    console.log('=== Naramania Bulk Scraper ===');
    console.log(`Start time: ${new Date().toISOString()}`);

    // Keep existing AI-extracted items
    let existingItems: ScrapedItem[] = [];
    try {
        const existing = fs.readFileSync('scraper_result.json', 'utf-8');
        existingItems = JSON.parse(existing).filter((item: ScrapedItem) =>
            item.id.startsWith('ai-extracted') || item.winningContractor || item.designFirm
        );
        console.log(`Preserving ${existingItems.length} AI-extracted items.`);
    } catch (e) {
        // No existing file
    }

    const results = await Promise.all([
        scrapeNaraPref(),
        scrapeNaraPrefSubPages(),
        scrapeNaraCity(),
        scrapeKashihara(),
        scrapeIkoma(),
    ]);

    const allItems = [...existingItems, ...results.flat()];

    // Dedup by title
    const seen = new Set<string>();
    const deduped = allItems.filter(item => {
        if (seen.has(item.title)) return false;
        seen.add(item.title);
        return true;
    });

    // Sort by date desc
    deduped.sort((a, b) => b.announcementDate.localeCompare(a.announcementDate));

    console.log(`\n=== Results ===`);
    console.log(`Total items (deduped): ${deduped.length}`);
    console.log(`By municipality:`);
    const byMuni: Record<string, number> = {};
    deduped.forEach(i => { byMuni[i.municipality] = (byMuni[i.municipality] || 0) + 1; });
    Object.entries(byMuni).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

    fs.writeFileSync('scraper_result.json', JSON.stringify(deduped, null, 2));
    console.log(`\nSaved to scraper_result.json`);
}

main().catch(console.error);

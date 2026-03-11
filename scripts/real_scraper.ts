/**
 * real_scraper.ts
 * 
 * "真実のデータ"のみを取得するスクレイパー。
 * 対応自治体: 奈良県, 奈良市, 生駒市, 天理市, 大和郡山市, 橿原市, 桜井市
 * 特徴:
 * - 偽データなし
 * - Shift_JIS対応 (TextDecoder)
 * - タイムアウト付きfetch
 * - エラー耐性 (1つ失敗しても他は続行)
 */
import * as cheerio from 'cheerio';
import fs from 'fs';
import crypto from 'crypto';

// Types
interface RealItem {
    id: string;
    municipality: string;
    title: string;
    link: string;
    announcementDate: string;
    status: '受付中' | '落札' | '締切間近' | '不明';
    type: '建築' | 'コンサル' | 'その他';
}

function makeId(muni: string) {
    return `real-${muni}-${crypto.randomUUID().split('-')[0]}`;
}

// ユーティリティ: HTML取得 (Timeout & Encoding 対応)
async function fetchHtml(url: string): Promise<string | null> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 15000); // 15秒タイムアウト

    try {
        console.log(`Fetching ${url}...`);
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) User-Agent: Mozilla/5.0 (compatible; NaramaniaBot/1.0)'
            },
            signal: controller.signal
        });
        clearTimeout(id);

        if (!res.ok) {
            console.error(`Failed to fetch ${url}: ${res.status}`);
            return null;
        }

        const buffer = await res.arrayBuffer();

        // 1. ヘッダーチェック
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('shift_jis') || contentType.includes('windows-31j')) {
            return new TextDecoder('shift-jis').decode(buffer);
        }

        // 2. とりあえずUTF-8でデコードしてmetaタグチェック
        let text = new TextDecoder('utf-8').decode(buffer);
        const metaMatch = text.match(/<meta[^>]*charset=["']?((?:shift_jis|sjis|windows-31j))["']?/i);
        if (metaMatch) {
            console.log(`Detected encoding: ${metaMatch[1]} for ${url}`);
            return new TextDecoder('shift-jis').decode(buffer);
        }

        return text;
    } catch (e: any) {
        clearTimeout(id);
        console.error(`Error fetching ${url}:`, e.message);
        return null;
    }
}

// ユーティリティ: 日付抽出
function extractDate(text: string): string | undefined {
    const m = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/) ||
        text.match(/R(\d{1,2})\.(\d{1,2})\.(\d{1,2})/) ||
        text.match(/令和(\d{1,2})年(\d{1,2})月(\d{1,2})日/) ||
        text.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);

    if (m) {
        const y = m[0].includes('R') || m[0].includes('令和')
            ? 2018 + parseInt(m[1])
            : parseInt(m[1]);
        const mo = parseInt(m[2]);
        const d = parseInt(m[3]);
        return `${y}-${mo.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
    }
    return undefined;
}

// キーワード判定
function getType(title: string): '建築' | 'コンサル' | 'その他' {
    if (title.includes('設計') || title.includes('監理') || title.includes('調査') || title.includes('測量')) return 'コンサル';
    if (title.includes('工事') || title.includes('建設') || title.includes('改修') || title.includes('舗装')) return '建築';
    return 'その他';
}

// ===== 各自治体スクレイパー =====

// 1. 奈良市
async function scrapeNaraCity(): Promise<RealItem[]> {
    const url = 'https://www.city.nara.lg.jp/site/nyusatu-keiyaku/list339-847.html';
    const html = await fetchHtml(url);
    if (!html) return [];

    const $ = cheerio.load(html);
    const items: RealItem[] = [];

    $('a').each((_, el) => {
        const title = $(el).text().trim();
        const link = $(el).attr('href');
        if (!link) return;

        if ((title.includes('工事') || title.includes('設計') || title.includes('業務')) && !title.includes('見通し')) {
            const date = extractDate($(el).parent().text()) || extractDate($('span.date', $(el).parent()).text() || '') || new Date().toISOString().split('T')[0];
            items.push({
                id: makeId('nara_city'), municipality: '奈良市', title,
                link: link.startsWith('http') ? link : `https://www.city.nara.lg.jp${link}`,
                announcementDate: date, status: '受付中', type: getType(title)
            });
        }
    });
    console.log(`奈良市: ${items.length}件`);
    return items;
}

// 2. 生駒市
async function scrapeIkomaCity(): Promise<RealItem[]> {
    const urls = [
        'https://www.city.ikoma.lg.jp/0000000216.html', // 公告
        'https://www.city.ikoma.lg.jp/0000000215.html'  // 結果?
    ];
    const items: RealItem[] = [];

    for (const url of urls) {
        const html = await fetchHtml(url);
        if (!html) continue;
        const $ = cheerio.load(html);

        $('a').each((_, el) => {
            const title = $(el).text().trim();
            const link = $(el).attr('href');
            if (!link) return;

            if ((title.includes('工事') || title.includes('広報') || title.includes('公告')) &&
                (title.includes('工事') || title.includes('設計') || title.includes('業務'))) {
                items.push({
                    id: makeId('ikoma'), municipality: '生駒市', title,
                    link: link.startsWith('http') ? link : `https://www.city.ikoma.lg.jp${link}`,
                    announcementDate: new Date().toISOString().split('T')[0], // Extract if possible
                    status: url.includes('215') ? '落札' : '受付中',
                    type: getType(title)
                });
            }
        });
    }
    console.log(`生駒市: ${items.length}件`);
    return items;
}

// 3. 天理市
async function scrapeTenri(): Promise<RealItem[]> {
    const url = 'https://www.city.tenri.nara.jp/kakuka/shichoukoshitsu/keiyakukensa/index.html';
    const html = await fetchHtml(url);
    if (!html) return [];

    const $ = cheerio.load(html);
    const items: RealItem[] = [];

    $('a').each((_, el) => {
        const title = $(el).text().trim();
        const link = $(el).attr('href');
        if (!link) return;

        if (title.includes('工事') || title.includes('結果')) {
            items.push({
                id: makeId('tenri'), municipality: '天理市', title,
                link: link.startsWith('http') ? link : `https://www.city.tenri.nara.jp${link}`,
                announcementDate: new Date().toISOString().split('T')[0],
                status: title.includes('結果') ? '落札' : '受付中',
                type: getType(title)
            });
        }
    });
    console.log(`天理市: ${items.length}件`);
    return items;
}

// 4. 大和郡山市
async function scrapeYamatoKoriyama(): Promise<RealItem[]> {
    const url = 'https://www.city.yamatokoriyama.lg.jp/soshiki/somu/keiyaku/index.html';
    const html = await fetchHtml(url);
    if (!html) return [];

    const $ = cheerio.load(html);
    const items: RealItem[] = [];

    $('a').each((_, el) => {
        const title = $(el).text().trim();
        const link = $(el).attr('href');
        if (!link) return;

        if (title.includes('入札') && (title.includes('結果') || title.includes('公告'))) {
            items.push({
                id: makeId('yamatokoriyama'), municipality: '大和郡山市', title,
                link: link.startsWith('http') ? link : `https://www.city.yamatokoriyama.lg.jp${link}`,
                announcementDate: new Date().toISOString().split('T')[0],
                status: title.includes('結果') ? '落札' : '受付中',
                type: getType(title)
            });
        }
    });
    console.log(`大和郡山市: ${items.length}件`);
    return items;
}

// 5. 奈良県
async function scrapeNaraPref(): Promise<RealItem[]> {
    const url = 'https://www.pref.nara.jp/10553.htm';
    const html = await fetchHtml(url);
    if (!html) return [];

    const $ = cheerio.load(html);
    const items: RealItem[] = [];

    $('a').each((_, el) => {
        const title = $(el).text().trim();
        const link = $(el).attr('href');
        if (!link) return;

        if (title.includes('工事') || title.includes('業務')) {
            const date = extractDate($(el).parent().text()) || new Date().toISOString().split('T')[0];
            items.push({
                id: makeId('nara_pref'), municipality: '奈良県', title,
                link: link.startsWith('http') ? link : `https://www.pref.nara.jp${link}`,
                announcementDate: date,
                status: '受付中',
                type: getType(title)
            });
        }
    });
    console.log(`奈良県: ${items.length}件`);
    return items;
}

// 6. 橿原市 (NEW)
async function scrapeKashihara(): Promise<RealItem[]> {
    const url = 'https://www.city.kashihara.nara.jp/soshiki/1033/1041.html';
    const html = await fetchHtml(url);
    if (!html) return [];

    const $ = cheerio.load(html);
    const items: RealItem[] = [];

    $('a').each((_, el) => {
        const title = $(el).text().trim();
        const link = $(el).attr('href');
        if (!link) return;

        if (title.includes('結果') || title.includes('公告') || title.includes('工事')) {
            items.push({
                id: makeId('kashihara'), municipality: '橿原市', title,
                link: link.startsWith('http') ? link : `https://www.city.kashihara.nara.jp${link}`,
                announcementDate: new Date().toISOString().split('T')[0],
                status: title.includes('結果') ? '落札' : '受付中',
                type: getType(title)
            });
        }
    });
    console.log(`橿原市: ${items.length}件`);
    return items;
}

// 7. 桜井市 (NEW)
async function scrapeSakurai(): Promise<RealItem[]> {
    const url = 'https://www.city.sakurai.lg.jp/admin/zaimu/kaikeikouza/keiyaku/index.html';
    const html = await fetchHtml(url);
    if (!html) return [];

    const $ = cheerio.load(html);
    const items: RealItem[] = [];

    $('a').each((_, el) => {
        const title = $(el).text().trim();
        const link = $(el).attr('href');
        if (!link) return;

        if (title.includes('入札') || title.includes('工事')) {
            items.push({
                id: makeId('sakurai'), municipality: '桜井市', title,
                link: link.startsWith('http') ? link : `https://www.city.sakurai.lg.jp${link}`,
                announcementDate: new Date().toISOString().split('T')[0],
                status: '情報あり' as any, // Mapped to '不明' later if needed
                type: getType(title)
            });
        }
    });
    console.log(`桜井市: ${items.length}件`);
    return items;
}

// Main
async function main() {
    console.log('Fetching REAL data (Expanded Mode)...');

    const scraperFunctions = [
        scrapeNaraCity,
        scrapeNaraPref,
        scrapeIkomaCity,
        scrapeTenri,
        scrapeYamatoKoriyama,
        scrapeKashihara,
        scrapeSakurai
    ];

    const results: RealItem[][] = [];

    // 直列実行でサーバー負荷を軽減しつつエラーを個別ハンドリング
    for (const scraper of scraperFunctions) {
        try {
            results.push(await scraper());
        } catch (e) {
            console.error(`Scraper failed:`, e);
            results.push([]);
        }
    }

    const flat = results.flat();

    // 重複排除 & Status修正
    const seen = new Set<string>();
    const unique = flat.filter(item => {
        const key = item.title + item.municipality;
        if (seen.has(key)) return false;

        // Status normalization
        if (item.status === '情報あり' as any) item.status = '受付中'; // Default

        seen.add(key);
        return true;
    });

    console.log(`\nTotal Real Items: ${unique.length}`);

    if (unique.length > 0) {
        fs.writeFileSync('scraper_result.json', JSON.stringify(unique, null, 2));
        console.log('Saved to scraper_result.json');
    } else {
        console.warn('No items found! Keeping previous file (if any).');
    }
}

main();

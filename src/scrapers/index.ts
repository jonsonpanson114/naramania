import { NaraPrefScraper } from './nara_pref';
import { NaraCityScraper } from './nara_city';
import { KashiharaCityScraper } from './kashihara_city';
import { IkomaCityScraper } from './ikoma_city';
import { YamatoTakadaCityScraper } from './yamato_takada_city';
import { YamatokoriyamaCityScraper } from './yamatokoriyama_city';
import { KatsuragiCityScraper } from './katsuragi_city';
import { GojoCityScraper } from './gojo_city';
import { GoseCityScraper } from './gose_city';
import { TenriCityScraper } from './tenri_city';
import { SakuraiCityScraper } from './sakurai_city';
import { TawaramotoTownScraper } from './tawaramoto_town';
import { KoryoTownScraper } from './koryo_town';
import { KashibaCityScraper } from './kashiba_city';
import { KawanishiCityScraper } from './kawanishi_city';
import { MiyakeCityScraper } from './miyake_city';
import { YamazomuraScraper, HiragawaScraper } from './yamazohiragawa_city';
import { AndoCityScraper } from './ando_city';
import { UdaCityScraper } from './uda_city';
import { TakatoriTownScraper, IkarugaTownScraper } from './takatori_ikaruga';
import { SangoTownScraper } from './sango_town';
import { OjiTownScraper } from './oji_town';
import { OyodoTownScraper } from './oyodo_town';
import { BiddingItem } from '../types/bidding';
import fs from 'fs';
import path from 'path';
import { shouldKeepBiddingItem } from './common/filter';

const QUALITY_PATH = path.join(process.cwd(), 'scraper_quality.json');

function dedupeKey(item: BiddingItem): string {
    return [item.municipality, item.announcementDate, item.title].join('|');
}

function writeQualitySummary(items: BiddingItem[], scrapedCount: number, rejectedCount: number) {
    const dates = items
        .map(item => item.announcementDate)
        .filter(Boolean)
        .sort();

    const summary = {
        generatedAt: new Date().toISOString(),
        source: 'daily_scrape',
        scrapedCount,
        keptCount: items.length,
        rejectedCount,
        oldestAnnouncementDate: dates[0] || null,
        latestAnnouncementDate: dates[dates.length - 1] || null,
        municipalityCount: new Set(items.map(item => item.municipality)).size,
    };

    fs.writeFileSync(QUALITY_PATH, JSON.stringify(summary, null, 2), 'utf-8');
}

async function main() {
    console.log('=== スクレイピング開始 ===');

    const scrapers = [
        new NaraPrefScraper(),
        new NaraCityScraper(),
        new KashiharaCityScraper(),
        new IkomaCityScraper(),
        new YamatoTakadaCityScraper(),
        new YamatokoriyamaCityScraper(),
        new KatsuragiCityScraper(),
        new GojoCityScraper(),
        new GoseCityScraper(),
        new TenriCityScraper(),
        new SakuraiCityScraper(),
        new UdaCityScraper(),
        new TawaramotoTownScraper(),
        new KoryoTownScraper(),
        new KashibaCityScraper(),
        new KawanishiCityScraper(),
        new YamazomuraScraper(),
        new HiragawaScraper(),
        new MiyakeCityScraper(),
        new AndoCityScraper(),
        new TakatoriTownScraper(),
        new IkarugaTownScraper(),
        new SangoTownScraper(),
        new OjiTownScraper(),
        new OyodoTownScraper(),
    ];

    const outputPath = path.join(process.cwd(), 'scraper_result.json');
    const seen = new Map<string, BiddingItem>();
    const seenContent = new Map<string, string>();
    let scrapedCount = 0;
    let rejectedCount = 0;

    // Load existing data
    if (fs.existsSync(outputPath)) {
        try {
            const content = fs.readFileSync(outputPath, 'utf-8');
            const existingItems: BiddingItem[] = JSON.parse(content);
            existingItems.filter(item => shouldKeepBiddingItem(item)).forEach(item => {
                seen.set(item.id, item);
                seenContent.set(dedupeKey(item), item.id);
            });
        } catch {
            console.warn('既存データの読み込みに失敗しました。');
        }
    }

    for (const scraper of scrapers) {
        console.log(`\n--- ${scraper.municipality} 開始 ---`);
        try {
            const items = await scraper.scrape();
            console.log(`→ ${scraper.municipality}: ${items.length}件取得`);
            scrapedCount += items.length;
            rejectedCount += items.filter(item => !shouldKeepBiddingItem(item)).length;
            
            // Merge immediately
            items.filter(item => shouldKeepBiddingItem(item)).forEach(item => {
                const existingId = seenContent.get(dedupeKey(item));
                const existing = seen.get(existingId || item.id);
                if (!existing) {
                    seen.set(item.id, item);
                    seenContent.set(dedupeKey(item), item.id);
                } else {
                    if (item.status === '落札' && existing.status === '受付中') existing.status = '落札';
                    if (item.winningContractor && !existing.winningContractor) existing.winningContractor = item.winningContractor;
                    if (item.biddingDate && !existing.biddingDate) existing.biddingDate = item.biddingDate;
                    if (item.announcementDate > existing.announcementDate) existing.announcementDate = item.announcementDate;
                }
            });

            // Save after each municipality (incremental save)
            const currentUnique = Array.from(seen.values());
            currentUnique.sort((a, b) => {
                const dateA = a.announcementDate ? new Date(a.announcementDate).getTime() : 0;
                const dateB = b.announcementDate ? new Date(b.announcementDate).getTime() : 0;
                return dateB - dateA;
            });
            fs.writeFileSync(outputPath, JSON.stringify(currentUnique, null, 2), 'utf-8');
            console.log(`[${scraper.municipality}] データを保存しました。合計: ${currentUnique.length}件`);

        } catch (error) {
            console.error(`✗ ${scraper.municipality} 失敗:`, error);
        }
    }

    console.log('\n=== 集計完了 ===');
    const finalUnique = Array.from(seen.values());
    writeQualitySummary(finalUnique, scrapedCount, rejectedCount);
    console.log(`最終合計: ${finalUnique.length} 件`);

    // 内訳表示
    const byMunicipality: Record<string, number> = {};
    finalUnique.forEach(item => {
        byMunicipality[item.municipality] = (byMunicipality[item.municipality] || 0) + 1;
    });
    console.log('\n自治体別件数:');
    Object.entries(byMunicipality).sort((a, b) => b[1] - a[1]).forEach(([m, count]) => {
        console.log(`  ${m}: ${count}件`);
    });
}

main().catch(console.error);

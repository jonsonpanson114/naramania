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

function keepEarlierDate(currentDate: string, candidateDate: string): string {
    if (!currentDate) return candidateDate;
    if (!candidateDate) return currentDate;
    return candidateDate < currentDate ? candidateDate : currentDate;
}

function mergeBiddingItem(existing: BiddingItem, candidate: BiddingItem) {
    if (candidate.status === '落札') {
        existing.status = '落札';
    } else if (
        candidate.status === '受付終了' &&
        (existing.status === '受付中' || existing.status === '締切間近' || (existing.status === '落札' && !existing.winningContractor))
    ) {
        existing.status = '受付終了';
    } else if (candidate.status === '締切間近' && existing.status === '受付中') {
        existing.status = '締切間近';
    }
    if (candidate.winningContractor && !existing.winningContractor) existing.winningContractor = candidate.winningContractor;
    if (candidate.biddingDate && !existing.biddingDate) existing.biddingDate = candidate.biddingDate;
    if (candidate.pdfUrl && !existing.pdfUrl) existing.pdfUrl = candidate.pdfUrl;
    if (candidate.link && !existing.link) existing.link = candidate.link;
    existing.announcementDate = keepEarlierDate(existing.announcementDate, candidate.announcementDate);
}

function upsertSeenItem(
    seen: Map<string, BiddingItem>,
    seenContent: Map<string, string>,
    item: BiddingItem,
) {
    const contentKey = dedupeKey(item);
    const existingId = seenContent.get(contentKey);
    const existing = seen.get(existingId || item.id);

    if (!existing) {
        seen.set(item.id, item);
        seenContent.set(contentKey, item.id);
        return;
    }

    mergeBiddingItem(existing, item);
    seenContent.set(contentKey, existing.id);
    seenContent.set(dedupeKey(existing), existing.id);
}

function buildDateAudit(items: BiddingItem[]) {
    const announcementAfterBidding = items.filter(item =>
        item.biddingDate && item.announcementDate && item.announcementDate > item.biddingDate,
    );
    const awardedWithoutBiddingDate = items.filter(item =>
        item.status === '落札' && !item.biddingDate,
    );
    const openWithWinner = items.filter(item =>
        item.status === '受付中' && item.winningContractor,
    );
    const awardedWithoutWinner = items.filter(item =>
        item.status === '落札' && !item.winningContractor,
    );

    return {
        announcementAfterBiddingCount: announcementAfterBidding.length,
        awardedWithoutBiddingDateCount: awardedWithoutBiddingDate.length,
        awardedWithoutWinnerCount: awardedWithoutWinner.length,
        openWithWinnerCount: openWithWinner.length,
        sampleTitles: [
            ...announcementAfterBidding.slice(0, 3),
            ...awardedWithoutBiddingDate.slice(0, 3),
            ...awardedWithoutWinner.slice(0, 3),
            ...openWithWinner.slice(0, 3),
        ].map(item => ({
            municipality: item.municipality,
            title: item.title,
            status: item.status,
            announcementDate: item.announcementDate,
            biddingDate: item.biddingDate || null,
        })),
    };
}

function writeQualitySummary(items: BiddingItem[], scrapedCount: number, rejectedCount: number) {
    const dates = items
        .map(item => item.announcementDate)
        .filter(Boolean)
        .sort();
    const dateAudit = buildDateAudit(items);

    const summary = {
        generatedAt: new Date().toISOString(),
        source: 'daily_scrape',
        scrapedCount,
        keptCount: items.length,
        rejectedCount,
        oldestAnnouncementDate: dates[0] || null,
        latestAnnouncementDate: dates[dates.length - 1] || null,
        municipalityCount: new Set(items.map(item => item.municipality)).size,
        dateAudit,
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
                upsertSeenItem(seen, seenContent, item);
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
                upsertSeenItem(seen, seenContent, item);
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

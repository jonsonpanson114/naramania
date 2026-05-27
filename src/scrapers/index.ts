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
import { BiddingItem, Scraper } from '../types/bidding';
import fs from 'fs';
import path from 'path';
import { shouldKeepBiddingItem } from './common/filter';
import { EXPECTED_MUNICIPALITIES, QUALITY_PATH, buildIntelligenceSummary, readQualitySummary } from '../lib/quality_summary';
import type { MunicipalityIssueEntry } from '../lib/quality_summary';

function normalizeComparisonTitle(title: string): string {
    return title
        .normalize('NFKC')
        .replace(/\s*(?:入札|開札)?結果$/u, '')
        .replace(/[（(]\s*(?:[0-9]+|[IVX]+)\s*期\s*[)）]/gi, '')
        .replace(/\s*\(圧縮ファイル:[^)]+\)$/u, '')
        .replace(/\s+/g, '')
        .replace(/[・･]/g, '')
        .trim();
}

function dedupeKey(item: BiddingItem): string {
    return [item.municipality, item.announcementDate, item.title].join('|');
}

function titleKey(item: BiddingItem): string {
    return [item.municipality, normalizeComparisonTitle(item.title)].join('|');
}

function daysBetween(dateA?: string, dateB?: string): number {
    if (!dateA || !dateB) return Number.POSITIVE_INFINITY;
    const a = new Date(dateA).getTime();
    const b = new Date(dateB).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
    return Math.abs(a - b) / (1000 * 60 * 60 * 24);
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
    const titleMatchId = seenContent.get(titleKey(item));
    const existing = seen.get(existingId || titleMatchId || item.id);

    if (
        existing &&
        !existingId &&
        titleMatchId &&
        daysBetween(existing.announcementDate, item.announcementDate) > 60
    ) {
        seen.set(item.id, item);
        seenContent.set(contentKey, item.id);
        seenContent.set(titleKey(item), item.id);
        return;
    }

    if (!existing) {
        seen.set(item.id, item);
        seenContent.set(contentKey, item.id);
        seenContent.set(titleKey(item), item.id);
        return;
    }

    mergeBiddingItem(existing, item);
    seenContent.set(contentKey, existing.id);
    seenContent.set(dedupeKey(existing), existing.id);
    seenContent.set(titleKey(existing), existing.id);
}

function replaceMunicipalityItems(
    seen: Map<string, BiddingItem>,
    seenContent: Map<string, string>,
    municipality: BiddingItem['municipality'],
) {
    const remainingItems = Array.from(seen.values()).filter(item => item.municipality !== municipality);
    seen.clear();
    seenContent.clear();
    remainingItems.forEach(item => upsertSeenItem(seen, seenContent, item));
}

function getMunicipalityItems(
    seen: Map<string, BiddingItem>,
    municipality: BiddingItem['municipality'],
): BiddingItem[] {
    return Array.from(seen.values()).filter(item => item.municipality === municipality);
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

function writeQualitySummary(
    items: BiddingItem[],
    scrapedCount: number,
    rejectedCount: number,
    retainedMunicipalities: string[] = [],
    issues: MunicipalityIssueEntry[] = [],
) {
    const previousSummary = readQualitySummary();
    const dates = items
        .map(item => item.announcementDate)
        .filter(Boolean)
        .sort();
    const dateAudit = buildDateAudit(items);
    const counts = items.reduce<Record<string, number>>((acc, item) => {
        acc[item.municipality] = (acc[item.municipality] || 0) + 1;
        return acc;
    }, {});
    const previousCounts = Object.fromEntries(
        (previousSummary?.municipalityAudit?.breakdown || []).map(entry => [entry.municipality, entry.count]),
    );
    const breakdown = Object.entries(counts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
        .map(([municipality, count]) => ({
            municipality,
            count,
            ...(Number.isFinite(previousCounts[municipality])
                ? { changeFromPrevious: count - previousCounts[municipality] }
                : {}),
        }));
    const missingMunicipalities = EXPECTED_MUNICIPALITIES.filter(municipality => !(municipality in counts));

    const summary = {
        generatedAt: new Date().toISOString(),
        source: 'daily_scrape',
        scrapedCount,
        keptCount: items.length,
        rejectedCount,
        oldestAnnouncementDate: dates[0] || null,
        latestAnnouncementDate: dates[dates.length - 1] || null,
        municipalityCount: new Set(items.map(item => item.municipality)).size,
        municipalityAudit: {
            expectedMunicipalityCount: EXPECTED_MUNICIPALITIES.length,
            coveredMunicipalityCount: Object.keys(counts).length,
            missingMunicipalities,
            zeroCountMunicipalities: missingMunicipalities,
            breakdown,
            retainedFromPrevious: retainedMunicipalities,
            issues,
        },
        dateAudit,
        intelligence: buildIntelligenceSummary(items),
    };

    fs.writeFileSync(QUALITY_PATH, JSON.stringify(summary, null, 2), 'utf-8');
}

async function main() {
    console.log('=== スクレイピング開始 ===');

    const scrapers: Scraper[] = [
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
    const retainedMunicipalities = new Set<string>();
    const municipalityIssues = new Map<string, MunicipalityIssueEntry[]>();

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
            const diagnostics = scraper.getDiagnostics?.();
            const issueEntries: MunicipalityIssueEntry[] = [
                ...(diagnostics?.warnings || []).map((message: string) => ({
                    municipality: scraper.municipality,
                    level: 'warning' as const,
                    message,
                })),
                ...(diagnostics?.errors || []).map((message: string) => ({
                    municipality: scraper.municipality,
                    level: 'error' as const,
                    message,
                })),
            ];
            if (issueEntries.length > 0) {
                municipalityIssues.set(scraper.municipality, issueEntries);
            }
            console.log(`→ ${scraper.municipality}: ${items.length}件取得`);
            scrapedCount += items.length;
            rejectedCount += items.filter(item => !shouldKeepBiddingItem(item)).length;
            const previousMunicipalityItems = getMunicipalityItems(seen, scraper.municipality);
            const keptItems = items.filter(item => shouldKeepBiddingItem(item));

            if (scraper.municipality === '奈良県' && keptItems.length === 0 && previousMunicipalityItems.length > 0) {
                retainedMunicipalities.add(scraper.municipality);
                console.warn(`[${scraper.municipality}] 0件取得のため前回データ ${previousMunicipalityItems.length}件を保持します`);
                municipalityIssues.set(scraper.municipality, [
                    ...(municipalityIssues.get(scraper.municipality) || []),
                    {
                        municipality: scraper.municipality,
                        level: 'warning',
                        message: `[${scraper.municipality}] 0件取得のため前回データ ${previousMunicipalityItems.length}件を保持しています`,
                    },
                ]);
                continue;
            }

            replaceMunicipalityItems(seen, seenContent, scraper.municipality);
            
            // Merge immediately
            keptItems.forEach(item => {
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
            municipalityIssues.set(scraper.municipality, [
                ...(municipalityIssues.get(scraper.municipality) || []),
                {
                    municipality: scraper.municipality,
                    level: 'error',
                    message: `✗ ${scraper.municipality} 失敗: ${error instanceof Error ? error.message : String(error)}`,
                },
            ]);
        }
    }

    console.log('\n=== 集計完了 ===');
    const finalUnique = Array.from(seen.values());
    writeQualitySummary(
        finalUnique,
        scrapedCount,
        rejectedCount,
        Array.from(retainedMunicipalities),
        Array.from(municipalityIssues.values()).flat(),
    );
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

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
import { EXPECTED_MUNICIPALITIES, QUALITY_PATH, buildDateAuditSummary, buildIntelligenceSummary, readQualitySummary } from '../lib/quality_summary';
import type { MunicipalityIssueEntry } from '../lib/quality_summary';
import { evaluateSourceCoverage } from '../lib/source_coverage';
import { OPENING_RESULT_UPDATES_PATH, buildOpeningResultUpdateReport } from '../lib/opening_result_updates';

const SNAPSHOT_PATH = path.join(process.cwd(), 'municipality_snapshots.json');
type MunicipalitySnapshots = Partial<Record<BiddingItem['municipality'], BiddingItem[]>>;

function parseMunicipalityEnvList(value?: string): Set<string> {
    if (!value) return new Set();

    return new Set(
        value
            .split(/[,\n]/)
            .map((entry) => entry.trim())
            .filter(Boolean),
    );
}

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

function comparisonDate(item: BiddingItem): string {
    return item.biddingDate || item.announcementDate;
}

function titleKey(item: BiddingItem): string {
    return [item.municipality, normalizeComparisonTitle(item.title), comparisonDate(item)].join('|');
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

function carryForwardEnrichment(candidate: BiddingItem, previous?: BiddingItem): BiddingItem {
    if (!previous) return candidate;

    return {
        ...candidate,
        estimatedPrice: candidate.estimatedPrice || previous.estimatedPrice,
        winningContractor: candidate.winningContractor || previous.winningContractor,
        designFirm: candidate.designFirm || previous.designFirm,
        constructionPeriod: candidate.constructionPeriod || previous.constructionPeriod,
        description: candidate.description || previous.description,
        tags: candidate.tags?.length ? candidate.tags : previous.tags,
        isIntelligenceExtracted: candidate.isIntelligenceExtracted ?? previous.isIntelligenceExtracted,
        extractionSource: candidate.extractionSource || previous.extractionSource,
    };
}

function buildPreviousLookup(items: BiddingItem[]): Map<string, BiddingItem> {
    const lookup = new Map<string, BiddingItem>();
    for (const item of items) {
        lookup.set(item.id, item);
        lookup.set(dedupeKey(item), item);
        lookup.set(titleKey(item), item);
    }
    return lookup;
}

function carryForwardMunicipalityEnrichment(candidates: BiddingItem[], previousItems: BiddingItem[]): BiddingItem[] {
    const previousLookup = buildPreviousLookup(previousItems);

    return candidates.map(candidate => carryForwardEnrichment(
        candidate,
        previousLookup.get(candidate.id)
            || previousLookup.get(dedupeKey(candidate))
            || previousLookup.get(titleKey(candidate)),
    ));
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

function isSameLogicalItem(left: BiddingItem, right: BiddingItem): boolean {
    return left.id === right.id || dedupeKey(left) === dedupeKey(right) || titleKey(left) === titleKey(right);
}

function shouldRetainNaraPrefHistoricalItem(item: BiddingItem): boolean {
    return item.municipality === '奈良県';
}

function hasScrapeFailureIssue(issueEntries: MunicipalityIssueEntry[] = []) {
    return issueEntries.some((issue) =>
        issue.level === 'error'
        || /エラー|失敗|forbidden|403|unexpected search page structure|サービス停止中|取得をスキップ/i.test(issue.message),
    );
}

function readMunicipalitySnapshots(): MunicipalitySnapshots {
    if (!fs.existsSync(SNAPSHOT_PATH)) return {};

    try {
        return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8')) as MunicipalitySnapshots;
    } catch {
        return {};
    }
}

function writeMunicipalitySnapshots(snapshots: MunicipalitySnapshots) {
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshots, null, 2), 'utf-8');
}

function reconcileStatusByDates(item: BiddingItem, todayIso: string): BiddingItem {
    if (
        item.status === '落札'
        && !item.winningContractor
        && item.biddingDate
        && item.biddingDate >= todayIso
    ) {
        return {
            ...item,
            status: '受付中',
        };
    }

    if (
        item.status === '受付中'
        && item.biddingDate
        && item.biddingDate < todayIso
    ) {
        return {
            ...item,
            status: '受付終了',
        };
    }

    return item;
}

function getTodayIsoInTokyo(): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
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
    const dateAudit = buildDateAuditSummary(items);
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
        sourceCoverage: evaluateSourceCoverage(items),
        intelligence: buildIntelligenceSummary(items),
    };

    fs.writeFileSync(QUALITY_PATH, JSON.stringify(summary, null, 2), 'utf-8');
}

async function main() {
    console.log('=== スクレイピング開始 ===');
    const todayIso = getTodayIsoInTokyo();

    const allScrapers: Scraper[] = [
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
    const onlyMunicipalities = parseMunicipalityEnvList(process.env.SCRAPE_ONLY_MUNICIPALITIES);
    const exceptMunicipalities = parseMunicipalityEnvList(process.env.SCRAPE_EXCEPT_MUNICIPALITIES);
    const scrapers = allScrapers.filter((scraper) => {
        if (onlyMunicipalities.size > 0 && !onlyMunicipalities.has(scraper.municipality)) {
            return false;
        }

        if (exceptMunicipalities.has(scraper.municipality)) {
            return false;
        }

        return true;
    });

    if (onlyMunicipalities.size > 0) {
        console.log(`[scrape] 対象自治体限定: ${Array.from(onlyMunicipalities).join(', ')}`);
    }
    if (exceptMunicipalities.size > 0) {
        console.log(`[scrape] 除外自治体: ${Array.from(exceptMunicipalities).join(', ')}`);
    }
    if (scrapers.length === 0) {
        throw new Error('実行対象の scraper がありません');
    }

    const outputPath = path.join(process.cwd(), 'scraper_result.json');
    const seen = new Map<string, BiddingItem>();
    const seenContent = new Map<string, string>();
    const snapshots = readMunicipalitySnapshots();
    let scrapedCount = 0;
    let rejectedCount = 0;
    let previousAllItems: BiddingItem[] = [];
    const retainedMunicipalities = new Set<string>();
    const municipalityIssues = new Map<string, MunicipalityIssueEntry[]>();

    // Load existing data
    if (fs.existsSync(outputPath)) {
        try {
            const content = fs.readFileSync(outputPath, 'utf-8');
            const existingItems: BiddingItem[] = JSON.parse(content);
            previousAllItems = existingItems.filter(item => shouldKeepBiddingItem(item));
            existingItems.filter(item => shouldKeepBiddingItem(item)).forEach(item => {
                upsertSeenItem(seen, seenContent, item);
            });

            if (Object.keys(snapshots).length === 0) {
                for (const municipality of EXPECTED_MUNICIPALITIES) {
                    const municipalityItems = existingItems
                        .filter(item => item.municipality === municipality && shouldKeepBiddingItem(item));
                    if (municipalityItems.length > 0) {
                        snapshots[municipality] = municipalityItems;
                    }
                }
                writeMunicipalitySnapshots(snapshots);
            }
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
            const snapshotMunicipalityItems = snapshots[scraper.municipality] || [];
            const keptItems = carryForwardMunicipalityEnrichment(
                items.filter(item => shouldKeepBiddingItem(item)),
                [...previousMunicipalityItems, ...snapshotMunicipalityItems],
            );
            const retainedHistory = scraper.municipality === '奈良県'
                ? [...previousMunicipalityItems, ...snapshotMunicipalityItems].filter((previousItem) =>
                    shouldRetainNaraPrefHistoricalItem(previousItem)
                    && shouldKeepBiddingItem(previousItem)
                    && !keptItems.some(item => isSameLogicalItem(item, previousItem)),
                )
                : [];
            if (retainedHistory.length > 0) {
                retainedHistory.forEach(item => keptItems.push(item));
                console.log(`[${scraper.municipality}] 履歴・結果付き案件 ${retainedHistory.length}件を保持します`);
            }
            const currentIssues = municipalityIssues.get(scraper.municipality) || [];

            if (
                hasScrapeFailureIssue(currentIssues) &&
                previousMunicipalityItems.length > 0 &&
                keptItems.length < previousMunicipalityItems.length
            ) {
                retainedMunicipalities.add(scraper.municipality);
                console.warn(`[${scraper.municipality}] 部分取得エラーのため既存データ ${previousMunicipalityItems.length}件を維持します (new kept=${keptItems.length})`);
                municipalityIssues.set(scraper.municipality, [
                    ...currentIssues,
                    {
                        municipality: scraper.municipality,
                        level: 'warning',
                        message: `[${scraper.municipality}] 部分取得エラーのため既存データ ${previousMunicipalityItems.length}件を維持しています (new kept=${keptItems.length})`,
                    },
                ]);
                continue;
            }
            if (
                keptItems.length === 0 &&
                (previousMunicipalityItems.length > 0 || snapshotMunicipalityItems.length > 0) &&
                hasScrapeFailureIssue(currentIssues)
            ) {
                const fallbackItems = previousMunicipalityItems.length > 0
                    ? previousMunicipalityItems
                    : snapshotMunicipalityItems;
                retainedMunicipalities.add(scraper.municipality);
                if (previousMunicipalityItems.length === 0 && snapshotMunicipalityItems.length > 0) {
                    replaceMunicipalityItems(seen, seenContent, scraper.municipality);
                    snapshotMunicipalityItems.forEach(item => upsertSeenItem(seen, seenContent, item));
                }
                console.warn(`[${scraper.municipality}] 0件取得のため保持データ ${fallbackItems.length}件を利用します`);
                municipalityIssues.set(scraper.municipality, [
                    ...currentIssues,
                    {
                        municipality: scraper.municipality,
                        level: 'warning',
                        message: `[${scraper.municipality}] 0件取得のため保持データ ${fallbackItems.length}件を維持しています`,
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
            const reconciledCurrentUnique = currentUnique.map(item => reconcileStatusByDates(item, todayIso));
            currentUnique.sort((a, b) => {
                const dateA = a.announcementDate ? new Date(a.announcementDate).getTime() : 0;
                const dateB = b.announcementDate ? new Date(b.announcementDate).getTime() : 0;
                return dateB - dateA;
            });
            const municipalityItemsAfterMerge = reconciledCurrentUnique
                .filter(item => item.municipality === scraper.municipality)
                .sort((a, b) => b.announcementDate.localeCompare(a.announcementDate));
            if (municipalityItemsAfterMerge.length > 0) {
                snapshots[scraper.municipality] = municipalityItemsAfterMerge;
                writeMunicipalitySnapshots(snapshots);
            }
            fs.writeFileSync(outputPath, JSON.stringify(reconciledCurrentUnique, null, 2), 'utf-8');
            console.log(`[${scraper.municipality}] データを保存しました。合計: ${reconciledCurrentUnique.length}件`);

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
    const finalUnique = Array.from(seen.values()).map(item => reconcileStatusByDates(item, todayIso));
    finalUnique.sort((a, b) => {
        const dateA = a.announcementDate ? new Date(a.announcementDate).getTime() : 0;
        const dateB = b.announcementDate ? new Date(b.announcementDate).getTime() : 0;
        return dateB - dateA;
    });
    fs.writeFileSync(outputPath, JSON.stringify(finalUnique, null, 2), 'utf-8');
    const openingResultReport = buildOpeningResultUpdateReport(previousAllItems, finalUnique);
    fs.writeFileSync(
        path.join(process.cwd(), OPENING_RESULT_UPDATES_PATH),
        JSON.stringify(openingResultReport, null, 2),
        'utf-8',
    );
    writeMunicipalitySnapshots(snapshots);
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

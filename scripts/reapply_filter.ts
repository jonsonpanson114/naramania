import fs from 'fs';
import path from 'path';
import { shouldKeepBiddingItem } from '../src/scrapers/common/filter';
import { BiddingItem } from '../src/types/bidding';
import { buildDateAuditSummary, buildIntelligenceSummary, EXPECTED_MUNICIPALITIES, readQualitySummary } from '../src/lib/quality_summary';
import { evaluateSourceCoverage } from '../src/lib/source_coverage';

const RESULT_PATH = path.join(process.cwd(), 'scraper_result.json');
const QUALITY_PATH = path.join(process.cwd(), 'scraper_quality.json');

function dedupeKey(item: BiddingItem): string {
    return [item.municipality, item.announcementDate, item.title].join('|');
}

function writeQualitySummary(originalCount: number, filteredItems: BiddingItem[]) {
    const previousSummary = readQualitySummary();
    const dates = filteredItems
        .map(item => item.announcementDate)
        .filter(Boolean)
        .sort();
    const counts = filteredItems.reduce<Record<string, number>>((acc, item) => {
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
        source: 'reapply_filter',
        originalCount,
        keptCount: filteredItems.length,
        removedCount: originalCount - filteredItems.length,
        oldestAnnouncementDate: dates[0] || null,
        latestAnnouncementDate: dates[dates.length - 1] || null,
        municipalityCount: new Set(filteredItems.map(item => item.municipality)).size,
        municipalityAudit: {
            expectedMunicipalityCount: EXPECTED_MUNICIPALITIES.length,
            coveredMunicipalityCount: Object.keys(counts).length,
            missingMunicipalities,
            zeroCountMunicipalities: missingMunicipalities,
            breakdown,
            retainedFromPrevious: previousSummary?.municipalityAudit?.retainedFromPrevious || [],
            issues: previousSummary?.municipalityAudit?.issues || [],
        },
        dateAudit: buildDateAuditSummary(filteredItems),
        sourceCoverage: evaluateSourceCoverage(filteredItems),
        intelligence: buildIntelligenceSummary(filteredItems, previousSummary?.intelligence?.lastAugmentedAt),
    };

    fs.writeFileSync(QUALITY_PATH, JSON.stringify(summary, null, 2), 'utf-8');
}

function main() {
    if (!fs.existsSync(RESULT_PATH)) {
        console.error('scraper_result.json is not found.');
        return;
    }

    const rawData = fs.readFileSync(RESULT_PATH, 'utf-8');
    const items: BiddingItem[] = JSON.parse(rawData);

    const originalCount = items.length;
    const filteredItems = Array.from(
        new Map(
            items
                .filter(item => shouldKeepBiddingItem(item))
                .map(item => [dedupeKey(item), item])
        ).values()
    );

    const newCount = filteredItems.length;
    const removedCount = originalCount - newCount;
    writeQualitySummary(originalCount, filteredItems);

    console.log(`Original Count: ${originalCount}`);
    console.log(`New Count: ${newCount}`);
    console.log(`Removed: ${removedCount} items`);

    if (removedCount > 0) {
        fs.writeFileSync(RESULT_PATH, JSON.stringify(filteredItems, null, 2), 'utf-8');
        console.log('scraper_result.json has been updated.');
    } else {
        console.log('No elements were removed.');
    }
}

main();

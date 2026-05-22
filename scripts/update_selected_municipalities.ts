import fs from 'fs';
import path from 'path';
import { GojoCityScraper } from '../src/scrapers/gojo_city';
import { IkomaCityScraper } from '../src/scrapers/ikoma_city';
import { UdaCityScraper } from '../src/scrapers/uda_city';
import { shouldKeepBiddingItem } from '../src/scrapers/common/filter';
import { BiddingItem, Scraper } from '../src/types/bidding';

const RESULT_PATH = path.join(process.cwd(), 'scraper_result.json');
const QUALITY_PATH = path.join(process.cwd(), 'scraper_quality.json');

const SCRAPER_MAP: Record<string, Scraper> = {
    gojo: new GojoCityScraper(),
    ikoma: new IkomaCityScraper(),
    uda: new UdaCityScraper(),
};

function normalizeComparisonTitle(title: string): string {
    return title
        .normalize('NFKC')
        .replace(/[（(]\s*(?:[0-9]+|[IVX]+)\s*期\s*[)）]/gi, '')
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

function buildDateAudit(items: BiddingItem[]) {
    const announcementAfterBidding = items.filter(item =>
        item.biddingDate && item.announcementDate && item.announcementDate > item.biddingDate,
    );
    const awardedWithoutBiddingDate = items.filter(item => item.status === '落札' && !item.biddingDate);
    const openWithWinner = items.filter(item => item.status === '受付中' && item.winningContractor);
    const awardedWithoutWinner = items.filter(item => item.status === '落札' && !item.winningContractor);

    return {
        announcementAfterBiddingCount: announcementAfterBidding.length,
        awardedWithoutBiddingDateCount: awardedWithoutBiddingDate.length,
        awardedWithoutWinnerCount: awardedWithoutWinner.length,
        openWithWinnerCount: openWithWinner.length,
    };
}

function writeQualitySummary(items: BiddingItem[]) {
    const dates = items.map(item => item.announcementDate).filter(Boolean).sort();
    const summary = {
        generatedAt: new Date().toISOString(),
        source: 'update_selected_municipalities',
        keptCount: items.length,
        oldestAnnouncementDate: dates[0] || null,
        latestAnnouncementDate: dates[dates.length - 1] || null,
        municipalityCount: new Set(items.map(item => item.municipality)).size,
        dateAudit: buildDateAudit(items),
    };

    fs.writeFileSync(QUALITY_PATH, JSON.stringify(summary, null, 2), 'utf-8');
}

async function main() {
    const targets = process.argv.slice(2).map(value => value.toLowerCase()).filter(Boolean);
    const selected = (targets.length ? targets : ['ikoma', 'uda'])
        .map(key => SCRAPER_MAP[key])
        .filter(Boolean);

    if (!selected.length) {
        console.error('No valid municipalities selected.');
        process.exit(1);
    }

    const seen = new Map<string, BiddingItem>();
    const seenContent = new Map<string, string>();

    if (fs.existsSync(RESULT_PATH)) {
        const existingItems: BiddingItem[] = JSON.parse(fs.readFileSync(RESULT_PATH, 'utf8'));
        existingItems.filter(item => shouldKeepBiddingItem(item)).forEach(item => {
            upsertSeenItem(seen, seenContent, item);
        });
    }

    for (const scraper of selected) {
        const items = await scraper.scrape();
        items.filter(item => shouldKeepBiddingItem(item)).forEach(item => {
            upsertSeenItem(seen, seenContent, item);
        });
    }

    const merged = Array.from(seen.values()).sort((a, b) => {
        const dateA = a.announcementDate ? new Date(a.announcementDate).getTime() : 0;
        const dateB = b.announcementDate ? new Date(b.announcementDate).getTime() : 0;
        return dateB - dateA;
    });

    fs.writeFileSync(RESULT_PATH, JSON.stringify(merged, null, 2), 'utf-8');
    writeQualitySummary(merged);
    console.log(`Updated ${selected.map(scraper => scraper.municipality).join(', ')}. Total items: ${merged.length}`);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});

import fs from 'fs';
import path from 'path';
import type { BiddingItem } from '@/types/bidding';

export interface QualitySummary {
    generatedAt: string;
    source: string;
    scrapedCount?: number;
    keptCount: number;
    rejectedCount?: number;
    originalCount?: number;
    removedCount?: number;
    oldestAnnouncementDate: string | null;
    latestAnnouncementDate: string | null;
    municipalityCount: number;
    dateAudit?: {
        announcementAfterBiddingCount: number;
        awardedWithoutBiddingDateCount: number;
        awardedWithoutWinnerCount: number;
        openWithWinnerCount: number;
        sampleTitles: Array<{
            municipality: string;
            title: string;
            status: string;
            announcementDate: string;
            biddingDate: string | null;
        }>;
    };
    intelligence?: {
        itemsWithPdf: number;
        itemsWithDescription: number;
        intelligenceExtractedCount: number;
        geminiExtractedCount: number;
        taggedCount: number;
        lastAugmentedAt?: string;
    };
}

export const QUALITY_PATH = path.join(process.cwd(), 'scraper_quality.json');

export function buildIntelligenceSummary(items: BiddingItem[], lastAugmentedAt?: string) {
    const itemsWithPdf = items.filter((item) => Boolean(item.pdfUrl)).length;
    const itemsWithDescription = items.filter((item) => Boolean(item.description?.trim())).length;
    const intelligenceExtractedCount = items.filter((item) => item.isIntelligenceExtracted === true).length;
    const geminiExtractedCount = items.filter((item) => item.extractionSource === 'gemini_3.1').length;
    const taggedCount = items.filter((item) => Array.isArray(item.tags) && item.tags.length > 0).length;

    return {
        itemsWithPdf,
        itemsWithDescription,
        intelligenceExtractedCount,
        geminiExtractedCount,
        taggedCount,
        ...(lastAugmentedAt ? { lastAugmentedAt } : {}),
    };
}

export function readQualitySummary(): QualitySummary | null {
    if (!fs.existsSync(QUALITY_PATH)) return null;

    try {
        return JSON.parse(fs.readFileSync(QUALITY_PATH, 'utf-8')) as QualitySummary;
    } catch {
        return null;
    }
}

export function writeQualitySummary(summary: QualitySummary) {
    fs.writeFileSync(QUALITY_PATH, JSON.stringify(summary, null, 2), 'utf-8');
}

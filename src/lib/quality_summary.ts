import fs from 'fs';
import path from 'path';
import type { BiddingItem } from '@/types/bidding';

export const EXPECTED_MUNICIPALITIES = [
    '奈良県', '奈良市', '橿原市', '生駒市', '大和高田市', '大和郡山市', '葛城市', '五條市',
    '御所市', '天理市', '桜井市', '宇陀市', '田原本町', '広陵町', '香芝市', '川西町',
    '三宅町', '山添村', '平群町', '安堵町', '高取町', '斑鳩町', '三郷町', '王寺町', '大淀町',
] as const;

export interface MunicipalityBreakdownEntry {
    municipality: string;
    count: number;
    changeFromPrevious?: number;
}

export interface MunicipalityIssueEntry {
    municipality: string;
    level: 'warning' | 'error';
    message: string;
}

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
    municipalityAudit?: {
        expectedMunicipalityCount: number;
        coveredMunicipalityCount: number;
        missingMunicipalities: string[];
        zeroCountMunicipalities: string[];
        breakdown: MunicipalityBreakdownEntry[];
        retainedFromPrevious?: string[];
        issues?: MunicipalityIssueEntry[];
    };
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
    const geminiExtractedCount = items.filter((item) => item.extractionSource === 'gemini' || item.extractionSource === 'gemini_3.1').length;
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

export function buildDateAuditSummary(items: BiddingItem[]) {
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

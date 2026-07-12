import fs from 'fs';
import path from 'path';
import type { BiddingItem } from '@/types/bidding';
import type { LiveSourceAuditReport } from '@/components/LiveSourceAuditPanel';
import { OPENING_RESULT_UPDATES_PATH, type OpeningResultUpdateReport } from '@/lib/opening_result_updates';

export interface QualitySummary {
  generatedAt?: string;
  source?: string;
  originalCount?: number;
  scrapedCount?: number;
  keptCount?: number;
  removedCount?: number;
  rejectedCount?: number;
  oldestAnnouncementDate?: string | null;
  latestAnnouncementDate?: string | null;
  municipalityCount?: number;
  sourceCoverage?: {
    activeCount: number;
    okCount: number;
    missingErrorCount: number;
    missingWarningCount: number;
    results: Array<{
      expectation: {
        municipality: string;
        requiredLinkIncludes: string[];
      };
      status: 'ok' | 'missing';
      totalCount: number;
      missingLinkIncludes: string[];
      sourceCounts: Record<string, number>;
      message: string;
    }>;
  };
  municipalityAudit?: {
    expectedMunicipalityCount?: number;
    coveredMunicipalityCount?: number;
    missingMunicipalities?: string[];
    zeroCountMunicipalities?: string[];
    retainedFromPrevious?: string[];
    issues?: Array<{
      municipality: string;
      level: 'warning' | 'error';
      message: string;
    }>;
    breakdown?: Array<{
      municipality: string;
      count: number;
      changeFromPrevious?: number;
    }>;
  };
}

export interface DashboardData {
  allItems: BiddingItem[];
  qualitySummary: QualitySummary | null;
  liveAuditReport: LiveSourceAuditReport | null;
  openingResultReport: OpeningResultUpdateReport | null;
}

function readJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

export function loadDashboardData(): DashboardData {
  const cwd = process.cwd();
  const allItems = readJson<BiddingItem[]>(path.join(cwd, 'scraper_result.json')) || [];

  allItems.sort((a, b) => new Date(b.announcementDate).getTime() - new Date(a.announcementDate).getTime());

  return {
    allItems,
    qualitySummary: readJson<QualitySummary>(path.join(cwd, 'scraper_quality.json')),
    liveAuditReport: readJson<LiveSourceAuditReport>(path.join(cwd, 'live_source_audit_report.json')),
    openingResultReport: readJson<OpeningResultUpdateReport>(path.join(cwd, OPENING_RESULT_UPDATES_PATH)),
  };
}

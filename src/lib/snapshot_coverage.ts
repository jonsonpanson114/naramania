import type { BiddingItem } from '@/types/bidding';
import { shouldKeepBiddingItem } from '@/scrapers/common/filter';

export type SnapshotCoverageStatus = 'ok' | 'missing';

export type SnapshotMissingItem = {
  id: string;
  municipality: BiddingItem['municipality'];
  title: string;
  status: BiddingItem['status'];
  announcementDate: string;
  biddingDate?: string;
  link: string;
  reason: string;
};

export type SnapshotCoverageMunicipalityResult = {
  municipality: BiddingItem['municipality'];
  snapshotCount: number;
  expectedCount: number;
  matchedCount: number;
  missingCount: number;
  missingItems: SnapshotMissingItem[];
  status: SnapshotCoverageStatus;
};

export type SnapshotCoverageSummary = {
  checkedMunicipalityCount: number;
  expectedItemCount: number;
  matchedItemCount: number;
  missingItemCount: number;
  results: SnapshotCoverageMunicipalityResult[];
};

export type MunicipalitySnapshots = Partial<Record<BiddingItem['municipality'], BiddingItem[]>>;

function normalizeTitle(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s*(?:入札|開札)?結果$/u, '')
    .replace(/[（(]\s*(?:[0-9]+|[ivx]+)\s*期\s*[)）]/gi, '')
    .replace(/\s*\(圧縮ファイル:[^)]+\)$/u, '')
    .replace(/[・･\s]/g, '')
    .trim();
}

function itemDateKeys(item: BiddingItem): string[] {
  return Array.from(new Set([item.announcementDate, item.biddingDate].filter((date): date is string => Boolean(date))));
}

function linkNeedle(item: BiddingItem): string | null {
  const value = item.pdfUrl || item.link;
  if (!value) return null;

  try {
    const url = new URL(value);
    const importantParams = ['kanriNo', 'name1', 'kikanno'];
    const param = importantParams
      .map((name) => url.searchParams.get(name))
      .find(Boolean);
    return param || url.pathname.split('/').filter(Boolean).pop() || value;
  } catch {
    return value;
  }
}

function buildResultKeys(items: BiddingItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of items) {
    const title = normalizeTitle(item.title);
    const dates = itemDateKeys(item);
    const link = linkNeedle(item);

    keys.add(`id:${item.id}`);
    keys.add(`title:${item.municipality}:${title}`);
    if (link) keys.add(`link:${item.municipality}:${link}`);
    for (const date of dates) {
      keys.add(`dated-title:${item.municipality}:${title}:${date}`);
    }
  }
  return keys;
}

function hasResultMatch(item: BiddingItem, resultKeys: Set<string>): boolean {
  const title = normalizeTitle(item.title);
  const dates = itemDateKeys(item);
  const link = linkNeedle(item);

  if (resultKeys.has(`id:${item.id}`)) return true;
  if (link && resultKeys.has(`link:${item.municipality}:${link}`)) return true;
  if (dates.some((date) => resultKeys.has(`dated-title:${item.municipality}:${title}:${date}`))) return true;
  return resultKeys.has(`title:${item.municipality}:${title}`);
}

function compactMissingItem(item: BiddingItem, reason: string): SnapshotMissingItem {
  return {
    id: item.id,
    municipality: item.municipality,
    title: item.title,
    status: item.status,
    announcementDate: item.announcementDate,
    ...(item.biddingDate ? { biddingDate: item.biddingDate } : {}),
    link: item.link,
    reason,
  };
}

export function evaluateSnapshotCoverage(
  items: BiddingItem[],
  snapshots: MunicipalitySnapshots,
  referenceDate = new Date(),
): SnapshotCoverageSummary {
  const resultKeys = buildResultKeys(items);
  const results = Object.entries(snapshots).map<SnapshotCoverageMunicipalityResult>(([municipality, snapshotItems = []]) => {
    const expectedItems = snapshotItems.filter((item) => shouldKeepBiddingItem(item, referenceDate));
    const missingItems = expectedItems
      .filter((item) => !hasResultMatch(item, resultKeys))
      .map((item) => compactMissingItem(item, 'snapshot item should be present in scraper_result'));

    return {
      municipality: municipality as BiddingItem['municipality'],
      snapshotCount: snapshotItems.length,
      expectedCount: expectedItems.length,
      matchedCount: expectedItems.length - missingItems.length,
      missingCount: missingItems.length,
      missingItems,
      status: missingItems.length > 0 ? 'missing' : 'ok',
    };
  }).sort((a, b) => b.missingCount - a.missingCount || b.expectedCount - a.expectedCount || a.municipality.localeCompare(b.municipality, 'ja'));

  return {
    checkedMunicipalityCount: results.length,
    expectedItemCount: results.reduce((sum, result) => sum + result.expectedCount, 0),
    matchedItemCount: results.reduce((sum, result) => sum + result.matchedCount, 0),
    missingItemCount: results.reduce((sum, result) => sum + result.missingCount, 0),
    results,
  };
}

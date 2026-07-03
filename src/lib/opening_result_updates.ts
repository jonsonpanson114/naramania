import type { BiddingItem } from '@/types/bidding';

export type OpeningResultUpdateKind = 'new_winner' | 'new_failure' | 'new_opened_status';

export type OpeningResultUpdate = {
  id: string;
  municipality: BiddingItem['municipality'];
  title: string;
  announcementDate: string;
  biddingDate?: string;
  status: BiddingItem['status'];
  winningContractor?: string;
  link: string;
  pdfUrl?: string;
  previousStatus?: BiddingItem['status'];
  previousWinningContractor?: string;
  detectedAt: string;
  kind: OpeningResultUpdateKind;
};

export type OpeningResultUpdateReport = {
  generatedAt: string;
  source: 'daily_scrape';
  updates: OpeningResultUpdate[];
  latestResults: OpeningResultUpdate[];
};

export const OPENING_RESULT_UPDATES_PATH = 'opening_result_updates.json';

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

function comparisonDate(item: BiddingItem): string {
  return item.biddingDate || item.announcementDate;
}

function dedupeKey(item: Pick<BiddingItem, 'municipality' | 'announcementDate' | 'title'>): string {
  return [item.municipality, item.announcementDate, item.title].join('|');
}

function titleKey(item: BiddingItem): string {
  return [item.municipality, normalizeComparisonTitle(item.title), comparisonDate(item)].join('|');
}

function isResultStatus(status: BiddingItem['status']): boolean {
  return status === '落札' || status === '不調';
}

function hasOpeningResult(item: BiddingItem): boolean {
  return Boolean(item.winningContractor) || isResultStatus(item.status);
}

function getUpdateKind(item: BiddingItem): OpeningResultUpdateKind {
  if (item.winningContractor) return 'new_winner';
  if (item.status === '不調') return 'new_failure';
  return 'new_opened_status';
}

function toUpdate(
  item: BiddingItem,
  detectedAt: string,
  previous?: BiddingItem,
): OpeningResultUpdate {
  return {
    id: item.id,
    municipality: item.municipality,
    title: item.title,
    announcementDate: item.announcementDate,
    biddingDate: item.biddingDate,
    status: item.status,
    winningContractor: item.winningContractor,
    link: item.link,
    pdfUrl: item.pdfUrl,
    previousStatus: previous?.status,
    previousWinningContractor: previous?.winningContractor,
    detectedAt,
    kind: getUpdateKind(item),
  };
}

function buildLookup(items: BiddingItem[]): Map<string, BiddingItem> {
  const lookup = new Map<string, BiddingItem>();
  for (const item of items) {
    lookup.set(item.id, item);
    lookup.set(dedupeKey(item), item);
    lookup.set(titleKey(item), item);
  }
  return lookup;
}

function findPreviousItem(item: BiddingItem, lookup: Map<string, BiddingItem>): BiddingItem | undefined {
  return lookup.get(item.id) || lookup.get(dedupeKey(item)) || lookup.get(titleKey(item));
}

function shouldReportAsNewOpeningResult(item: BiddingItem, previous?: BiddingItem): boolean {
  if (!hasOpeningResult(item)) return false;
  if (!previous) return true;

  const previousHadOpeningResult = hasOpeningResult(previous);
  if (!previousHadOpeningResult) return true;
  if (item.winningContractor && item.winningContractor !== previous.winningContractor) return true;
  if (isResultStatus(item.status) && item.status !== previous.status) return true;

  return false;
}

function resultSortValue(item: Pick<BiddingItem, 'biddingDate' | 'announcementDate'>): string {
  return item.biddingDate || item.announcementDate || '';
}

export function buildOpeningResultUpdates(
  previousItems: BiddingItem[],
  currentItems: BiddingItem[],
  detectedAt = new Date().toISOString(),
): OpeningResultUpdate[] {
  const previousLookup = buildLookup(previousItems);

  return currentItems
    .filter((item) => hasOpeningResult(item))
    .filter((item) => shouldReportAsNewOpeningResult(item, findPreviousItem(item, previousLookup)))
    .map((item) => toUpdate(item, detectedAt, findPreviousItem(item, previousLookup)))
    .sort((a, b) => resultSortValue(b).localeCompare(resultSortValue(a)) || b.title.localeCompare(a.title, 'ja'));
}

export function buildLatestOpeningResults(
  items: BiddingItem[],
  limit = 8,
  detectedAt = new Date().toISOString(),
): OpeningResultUpdate[] {
  return items
    .filter((item) => hasOpeningResult(item))
    .sort((a, b) => resultSortValue(b).localeCompare(resultSortValue(a)) || b.title.localeCompare(a.title, 'ja'))
    .slice(0, limit)
    .map((item) => toUpdate(item, detectedAt));
}

export function buildOpeningResultUpdateReport(
  previousItems: BiddingItem[],
  currentItems: BiddingItem[],
  detectedAt = new Date().toISOString(),
): OpeningResultUpdateReport {
  return {
    generatedAt: detectedAt,
    source: 'daily_scrape',
    updates: buildOpeningResultUpdates(previousItems, currentItems, detectedAt).slice(0, 20),
    latestResults: buildLatestOpeningResults(currentItems, 12, detectedAt),
  };
}

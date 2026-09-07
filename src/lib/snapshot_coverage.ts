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
  duplicateTitleGroupCount: number;
  duplicateTitleItemCount: number;
  missingItems: SnapshotMissingItem[];
  status: SnapshotCoverageStatus;
};

export type SnapshotCoverageSummary = {
  checkedMunicipalityCount: number;
  expectedItemCount: number;
  matchedItemCount: number;
  missingItemCount: number;
  duplicateTitleGroupCount: number;
  duplicateTitleItemCount: number;
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
    const importantParams = ['kanriNo', 'control_no', 'name1', 'kikanno'];
    const param = importantParams
      .map((name) => url.searchParams.get(name))
      .find(Boolean);
    return param || url.pathname.split('/').filter(Boolean).pop() || value;
  } catch {
    return value;
  }
}

/** 自治体ごとに、そのURLを何件の案件が使っているかを数える */
export function countLinkNeedles(items: BiddingItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const link = linkNeedle(item);
    if (!link) continue;
    const key = `${item.municipality}:${link}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

export function linkNeedleKey(item: BiddingItem): string | null {
  const link = linkNeedle(item);
  return link ? `${item.municipality}:${link}` : null;
}

function buildResultKeys(items: BiddingItem[]): Set<string> {
  const keys = new Set<string>();
  // 自治体トップページのように複数案件が同じURLを持つ場合、URLは案件の識別子に
  // ならない。1件でも結果にあれば同じURLの案件すべてが「存在する」と判定され、
  // 実際には欠けている案件を見逃す。
  // 実データでは296件中111件が他の案件とURLを共有していた。特にEPIは機関IDが
  // URLに入るだけなので、その自治体の全案件が同じ値になる。
  // そこで、その自治体内で1件しか使っていないURLだけを識別子として採用する。
  const needleCounts = countLinkNeedles(items);

  for (const item of items) {
    const title = normalizeTitle(item.title);
    const dates = itemDateKeys(item);
    const linkKey = linkNeedleKey(item);

    keys.add(`id:${item.id}`);
    keys.add(`title:${item.municipality}:${title}`);
    if (linkKey && needleCounts.get(linkKey) === 1) keys.add(`link:${linkKey}`);
    for (const date of dates) {
      keys.add(`dated-title:${item.municipality}:${title}:${date}`);
    }
  }
  return keys;
}

function normalizedTitleKey(item: BiddingItem): string {
  return `${item.municipality}:${normalizeTitle(item.title)}`;
}

function countTitleGroups(items: BiddingItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = normalizedTitleKey(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function hasResultMatch(
  item: BiddingItem,
  resultKeys: Set<string>,
  allowTitleFallback: boolean,
  allowLinkMatch: boolean,
): boolean {
  const title = normalizeTitle(item.title);
  const dates = itemDateKeys(item);
  const linkKey = linkNeedleKey(item);

  if (resultKeys.has(`id:${item.id}`)) return true;
  // 照合する側のURLも他案件と共有していないときだけ識別子として使う。
  // 結果側だけを絞っても、期待側で共有していれば別案件に当たりうるため両側で見る。
  if (allowLinkMatch && linkKey && resultKeys.has(`link:${linkKey}`)) return true;
  if (dates.some((date) => resultKeys.has(`dated-title:${item.municipality}:${title}:${date}`))) return true;
  return allowTitleFallback && resultKeys.has(`title:${item.municipality}:${title}`);
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
    const titleCounts = countTitleGroups(expectedItems);
    const duplicateTitleKeys = new Set(
      Array.from(titleCounts.entries())
        .filter(([, count]) => count > 1)
        .map(([key]) => key),
    );
    const expectedNeedleCounts = countLinkNeedles(expectedItems);
    const missingItems = expectedItems
      .filter((item) => {
        const linkKey = linkNeedleKey(item);
        const allowLinkMatch = Boolean(linkKey) && expectedNeedleCounts.get(linkKey!) === 1;
        return !hasResultMatch(
          item,
          resultKeys,
          !duplicateTitleKeys.has(normalizedTitleKey(item)),
          allowLinkMatch,
        );
      })
      .map((item) => compactMissingItem(
        item,
        duplicateTitleKeys.has(normalizedTitleKey(item))
          ? 'duplicate title snapshot item requires id, link, or date match in scraper_result'
          : 'snapshot item should be present in scraper_result',
      ));

    return {
      municipality: municipality as BiddingItem['municipality'],
      snapshotCount: snapshotItems.length,
      expectedCount: expectedItems.length,
      matchedCount: expectedItems.length - missingItems.length,
      missingCount: missingItems.length,
      duplicateTitleGroupCount: duplicateTitleKeys.size,
      duplicateTitleItemCount: expectedItems.filter((item) => duplicateTitleKeys.has(normalizedTitleKey(item))).length,
      missingItems,
      status: missingItems.length > 0 ? 'missing' : 'ok',
    };
  }).sort((a, b) => b.missingCount - a.missingCount || b.expectedCount - a.expectedCount || a.municipality.localeCompare(b.municipality, 'ja'));

  return {
    checkedMunicipalityCount: results.length,
    expectedItemCount: results.reduce((sum, result) => sum + result.expectedCount, 0),
    matchedItemCount: results.reduce((sum, result) => sum + result.matchedCount, 0),
    missingItemCount: results.reduce((sum, result) => sum + result.missingCount, 0),
    duplicateTitleGroupCount: results.reduce((sum, result) => sum + result.duplicateTitleGroupCount, 0),
    duplicateTitleItemCount: results.reduce((sum, result) => sum + result.duplicateTitleItemCount, 0),
    results,
  };
}

import type { BiddingItem } from '@/types/bidding';
import { isCurrentFiscalYearItem } from '@/lib/practical_filters';

export type ResultFollowUpPriority = 'high' | 'medium' | 'low';

export type ResultFollowUpEntry = {
  item: BiddingItem;
  priority: ResultFollowUpPriority;
  ageDays: number | null;
  reason: string;
};

export type ResultFollowUpSummary = {
  totalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  missingBiddingDateCount: number;
  byMunicipality: Array<{
    municipality: string;
    count: number;
  }>;
  entries: ResultFollowUpEntry[];
};

function getTokyoTodayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function daysSince(dateStr: string, referenceDateIso: string): number | null {
  const target = new Date(`${dateStr}T00:00:00+09:00`).getTime();
  const reference = new Date(`${referenceDateIso}T00:00:00+09:00`).getTime();
  if (Number.isNaN(target) || Number.isNaN(reference)) return null;
  return Math.max(0, Math.floor((reference - target) / (1000 * 60 * 60 * 24)));
}

function classifyPriority(ageDays: number | null, hasBiddingDate: boolean): ResultFollowUpPriority {
  if (!hasBiddingDate) return 'medium';
  if (ageDays === null) return 'medium';
  if (ageDays >= 14) return 'high';
  if (ageDays >= 3) return 'medium';
  return 'low';
}

function getReason(item: BiddingItem, ageDays: number | null): string {
  if (item.status === '落札' && !item.winningContractor) return '落札済みだが落札者が空';
  if (!item.biddingDate) return '開札日未取得のまま受付終了';
  if (ageDays !== null && ageDays >= 14) return `開札日から${ageDays}日経過`;
  if (ageDays !== null && ageDays >= 3) return `開札日から${ageDays}日経過`;
  return '開札直後の結果待ち';
}

function isFollowUpTarget(item: BiddingItem, referenceDateIso: string): boolean {
  // 発注見通し由来の公告前案件はまだ入札していないので追跡しない
  if (item.isForecast) return false;
  // 過年度案件の結果追跡はしない（今年度分のみ追う運用方針）
  if (!isCurrentFiscalYearItem(item, referenceDateIso)) return false;
  return item.status === '受付終了' || (item.status === '落札' && !item.winningContractor);
}

export function buildResultFollowUpSummary(
  items: BiddingItem[],
  referenceDateIso = getTokyoTodayIso(),
): ResultFollowUpSummary {
  const entries = items
    .filter((item) => isFollowUpTarget(item, referenceDateIso))
    .map((item) => {
      const ageDays = item.biddingDate ? daysSince(item.biddingDate, referenceDateIso) : null;
      const priority = classifyPriority(ageDays, Boolean(item.biddingDate));
      return {
        item,
        priority,
        ageDays,
        reason: getReason(item, ageDays),
      };
    })
    .sort((a, b) => {
      const priorityRank: Record<ResultFollowUpPriority, number> = { high: 0, medium: 1, low: 2 };
      return priorityRank[a.priority] - priorityRank[b.priority]
        || (b.ageDays ?? 9999) - (a.ageDays ?? 9999)
        || (a.item.biddingDate || '').localeCompare(b.item.biddingDate || '')
        || a.item.municipality.localeCompare(b.item.municipality, 'ja');
    });

  const municipalityCounts = entries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.item.municipality] = (acc[entry.item.municipality] || 0) + 1;
    return acc;
  }, {});

  return {
    totalCount: entries.length,
    highCount: entries.filter((entry) => entry.priority === 'high').length,
    mediumCount: entries.filter((entry) => entry.priority === 'medium').length,
    lowCount: entries.filter((entry) => entry.priority === 'low').length,
    missingBiddingDateCount: entries.filter((entry) => !entry.item.biddingDate).length,
    byMunicipality: Object.entries(municipalityCounts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
      .map(([municipality, count]) => ({ municipality, count })),
    entries,
  };
}

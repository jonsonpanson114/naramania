import type { BiddingItem, Municipality } from '@/types/bidding';
import criticalWatchlist from '../../config/critical_watchlist.json';

export type WatchSeverity = 'error' | 'warning';
export type WatchStatus = 'ok' | 'missing' | 'expired';

export type CriticalProjectWatch = {
  id: string;
  label: string;
  municipality?: Municipality;
  titleIncludes: string[];
  linkIncludes?: string[];
  requiredStatus?: BiddingItem['status'];
  requiresBiddingDate?: boolean;
  requiresWinner?: boolean;
  activeUntil?: string;
  severity?: WatchSeverity;
  note?: string;
};

export type CriticalSourceWatch = {
  id: string;
  label: string;
  municipality?: Municipality;
  linkIncludes: string[];
  minItems?: number;
  activeUntil?: string;
  severity?: WatchSeverity;
  note?: string;
};

export type CriticalWatchConfig = {
  projects: CriticalProjectWatch[];
  sources: CriticalSourceWatch[];
};

export type ProjectWatchResult = {
  type: 'project';
  watch: CriticalProjectWatch;
  status: WatchStatus;
  severity: WatchSeverity;
  matches: BiddingItem[];
  fieldIssues: string[];
  message: string;
};

export type SourceWatchResult = {
  type: 'source';
  watch: CriticalSourceWatch;
  status: WatchStatus;
  severity: WatchSeverity;
  count: number;
  matches: BiddingItem[];
  message: string;
};

export type CriticalWatchResult = {
  projectResults: ProjectWatchResult[];
  sourceResults: SourceWatchResult[];
  activeCount: number;
  okCount: number;
  warningCount: number;
  errorCount: number;
  missingErrorCount: number;
  missingWarningCount: number;
};

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

function todayLabel(referenceDate: Date): string {
  return referenceDate.toISOString().slice(0, 10);
}

function severityOf(value?: WatchSeverity): WatchSeverity {
  return value === 'warning' ? 'warning' : 'error';
}

function isActive(activeUntil: string | undefined, referenceDate: Date): boolean {
  if (!activeUntil) return true;
  return activeUntil >= todayLabel(referenceDate);
}

function includesAll(value: string, needles: string[]): boolean {
  const haystack = normalize(value);
  return needles.every((needle) => haystack.includes(normalize(needle)));
}

function itemLinkText(item: BiddingItem): string {
  return [item.link || '', item.pdfUrl || ''].join(' ');
}

function matchesProject(item: BiddingItem, watch: CriticalProjectWatch): boolean {
  if (watch.municipality && item.municipality !== watch.municipality) return false;
  if (!includesAll(item.title, watch.titleIncludes)) return false;
  if (watch.linkIncludes && watch.linkIncludes.length > 0 && !includesAll(itemLinkText(item), watch.linkIncludes)) return false;
  return true;
}

function getProjectFieldIssues(item: BiddingItem, watch: CriticalProjectWatch): string[] {
  const issues: string[] = [];
  if (watch.requiredStatus && item.status !== watch.requiredStatus) {
    issues.push(`status=${item.status}, expected=${watch.requiredStatus}`);
  }
  if (watch.requiresBiddingDate && !item.biddingDate) {
    issues.push('biddingDate missing');
  }
  if (watch.requiresWinner && !item.winningContractor) {
    issues.push('winningContractor missing');
  }
  return issues;
}

function matchesSource(item: BiddingItem, watch: CriticalSourceWatch): boolean {
  if (watch.municipality && item.municipality !== watch.municipality) return false;
  return includesAll(itemLinkText(item), watch.linkIncludes);
}

export function getCriticalWatchConfig(): CriticalWatchConfig {
  return criticalWatchlist as CriticalWatchConfig;
}

export function evaluateCriticalWatch(
  items: BiddingItem[],
  referenceDate = new Date(),
  config: CriticalWatchConfig = getCriticalWatchConfig(),
): CriticalWatchResult {
  const projectResults = config.projects.map<ProjectWatchResult>((watch) => {
    const severity = severityOf(watch.severity);
    const active = isActive(watch.activeUntil, referenceDate);
    const matches = active ? items.filter((item) => matchesProject(item, watch)) : [];
    const fieldIssuesByMatch = matches.map((item) => getProjectFieldIssues(item, watch));
    const satisfiedMatches = matches.filter((_, index) => fieldIssuesByMatch[index].length === 0);
    const fieldIssues = Array.from(new Set(fieldIssuesByMatch.flat()));
    const status: WatchStatus = active ? (satisfiedMatches.length > 0 ? 'ok' : 'missing') : 'expired';

    return {
      type: 'project',
      watch,
      status,
      severity,
      matches,
      fieldIssues,
      message: status === 'ok'
        ? `${watch.label}: ${satisfiedMatches.length}件確認`
        : status === 'expired'
          ? `${watch.label}: 監視期限切れ`
          : matches.length > 0
            ? `${watch.label}: 重要案件はありますが必須情報が不足 (${fieldIssues.join(', ')})`
            : `${watch.label}: 重要案件が見つかりません`,
    };
  });

  const sourceResults = config.sources.map<SourceWatchResult>((watch) => {
    const severity = severityOf(watch.severity);
    const active = isActive(watch.activeUntil, referenceDate);
    const matches = active ? items.filter((item) => matchesSource(item, watch)) : [];
    const minItems = watch.minItems ?? 1;
    const status: WatchStatus = active ? (matches.length >= minItems ? 'ok' : 'missing') : 'expired';

    return {
      type: 'source',
      watch,
      status,
      severity,
      count: matches.length,
      matches,
      message: status === 'ok'
        ? `${watch.label}: ${matches.length}件確認`
        : status === 'expired'
          ? `${watch.label}: 監視期限切れ`
          : `${watch.label}: 必要件数 ${minItems}件に対して ${matches.length}件`,
    };
  });

  const activeResults = [...projectResults, ...sourceResults].filter((result) => result.status !== 'expired');
  const missingResults = activeResults.filter((result) => result.status === 'missing');

  return {
    projectResults,
    sourceResults,
    activeCount: activeResults.length,
    okCount: activeResults.filter((result) => result.status === 'ok').length,
    warningCount: activeResults.filter((result) => result.severity === 'warning').length,
    errorCount: activeResults.filter((result) => result.severity === 'error').length,
    missingErrorCount: missingResults.filter((result) => result.severity === 'error').length,
    missingWarningCount: missingResults.filter((result) => result.severity === 'warning').length,
  };
}

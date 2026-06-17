import type { BiddingItem } from '@/types/bidding';
import { AlertTriangle, CheckCircle2, DatabaseZap, FileSearch, ShieldAlert } from 'lucide-react';

type MunicipalityIssue = {
  municipality: string;
  level: 'warning' | 'error';
  message: string;
};

type MunicipalityBreakdownItem = {
  municipality: string;
  count: number;
  changeFromPrevious?: number;
};

type QualitySummary = {
  generatedAt?: string;
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
    issues?: MunicipalityIssue[];
    breakdown?: MunicipalityBreakdownItem[];
  };
};

type CoverageStatus = 'ok' | 'watch' | 'risk';

type CoverageRow = {
  municipality: string;
  count: number;
  changeFromPrevious?: number;
  latestDate: string;
  openCount: number;
  awardedCount: number;
  sourceLabels: string[];
  sourceHealth?: {
    status: 'ok' | 'missing';
    required: string[];
    missing: string[];
    counts: Record<string, number>;
  };
  issue?: MunicipalityIssue;
  retained: boolean;
  status: CoverageStatus;
};

const STATUS_META: Record<CoverageStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  ok: {
    label: 'OK',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    icon: CheckCircle2,
  },
  watch: {
    label: '注意',
    className: 'border-amber-200 bg-amber-50 text-amber-800',
    icon: AlertTriangle,
  },
  risk: {
    label: '要確認',
    className: 'border-rose-200 bg-rose-50 text-rose-700',
    icon: ShieldAlert,
  },
};

function formatGeneratedAt(value?: string): string {
  if (!value) return '記録なし';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function cleanIssueMessage(message: string): string {
  return message
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 88);
}

function sourceLabelsFor(items: BiddingItem[]): string[] {
  const labels = new Set<string>();
  for (const item of items) {
    const link = `${item.link || ''} ${item.pdfUrl || ''}`;
    if (/epi-cloud/i.test(link)) labels.add('情報公開');
    if (/ppi\.ebid-kouji-gyoumu/i.test(link)) labels.add('県PPI');
    if (/\.pdf/i.test(link)) labels.add('PDF');
    if (/city\.|town\.|vill\.|pref\./i.test(link)) labels.add('自治体HP');
  }
  return Array.from(labels).slice(0, 4);
}

function readableSourceLabel(source: string): string {
  if (/epi-cloud/i.test(source)) return '情報公開';
  if (/efftis/i.test(source)) return 'PPI';
  if (/ppi\.ebid-kouji-gyoumu/i.test(source)) return '県PPI';
  if (/city\.|town\.|vill\.|pref\./i.test(source)) return '自治体HP';
  return source.replace(/^www\./, '').replace(/\/.*$/, '');
}

function buildRows(items: BiddingItem[], quality: QualitySummary | null): CoverageRow[] {
  const audit = quality?.municipalityAudit;
  const issues = audit?.issues || [];
  const issueMap = new Map<string, MunicipalityIssue[]>();
  for (const issue of issues) {
    const list = issueMap.get(issue.municipality) || [];
    list.push(issue);
    issueMap.set(issue.municipality, list);
  }

  const retained = new Set(audit?.retainedFromPrevious || []);
  const missing = new Set([...(audit?.missingMunicipalities || []), ...(audit?.zeroCountMunicipalities || [])]);
  const sourceCoverageByMunicipality = new Map(
    (quality?.sourceCoverage?.results || []).map((result) => [result.expectation.municipality, result]),
  );
  const itemMap = new Map<string, BiddingItem[]>();
  for (const item of items) {
    const list = itemMap.get(item.municipality) || [];
    list.push(item);
    itemMap.set(item.municipality, list);
  }

  const breakdown = new Map<string, MunicipalityBreakdownItem>();
  for (const entry of audit?.breakdown || []) {
    breakdown.set(entry.municipality, entry);
  }
  for (const [municipality, list] of itemMap) {
    if (!breakdown.has(municipality)) {
      breakdown.set(municipality, { municipality, count: list.length });
    }
  }
  for (const municipality of missing) {
    if (!breakdown.has(municipality)) {
      breakdown.set(municipality, { municipality, count: 0 });
    }
  }

  return Array.from(breakdown.values()).map((entry) => {
    const municipalityItems = itemMap.get(entry.municipality) || [];
    const municipalityIssues = issueMap.get(entry.municipality) || [];
    const primaryIssue = municipalityIssues.find((issue) => issue.level === 'error') || municipalityIssues[0];
    const latestDate = municipalityItems
      .map((item) => item.announcementDate)
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a))[0] || '';
    const hasError = municipalityIssues.some((issue) => issue.level === 'error');
    const hasWarning = municipalityIssues.some((issue) => issue.level === 'warning');
    const isMissing = missing.has(entry.municipality) || entry.count === 0;
    const isThin = entry.count <= 2;
    const sourceCoverage = sourceCoverageByMunicipality.get(entry.municipality);
    const hasSourceGap = sourceCoverage?.status === 'missing';
    const status: CoverageStatus = isMissing || hasError || hasSourceGap ? 'risk' : retained.has(entry.municipality) || hasWarning || isThin ? 'watch' : 'ok';

    return {
      municipality: entry.municipality,
      count: entry.count,
      changeFromPrevious: entry.changeFromPrevious,
      latestDate,
      openCount: municipalityItems.filter((item) => item.status === '受付中').length,
      awardedCount: municipalityItems.filter((item) => item.status === '落札').length,
      sourceLabels: sourceLabelsFor(municipalityItems),
      sourceHealth: sourceCoverage
        ? {
            status: sourceCoverage.status,
            required: sourceCoverage.expectation.requiredLinkIncludes,
            missing: sourceCoverage.missingLinkIncludes,
            counts: sourceCoverage.sourceCounts,
          }
        : undefined,
      issue: primaryIssue,
      retained: retained.has(entry.municipality),
      status,
    };
  }).sort((a, b) => {
    const rank = { risk: 0, watch: 1, ok: 2 };
    return rank[a.status] - rank[b.status] || b.count - a.count || a.municipality.localeCompare(b.municipality, 'ja');
  });
}

export function MunicipalityCoverageDashboard({
  items,
  quality,
}: {
  items: BiddingItem[];
  quality: QualitySummary | null;
}) {
  const rows = buildRows(items, quality);
  const okCount = rows.filter((row) => row.status === 'ok').length;
  const watchCount = rows.filter((row) => row.status === 'watch').length;
  const riskCount = rows.filter((row) => row.status === 'risk').length;
  const expected = quality?.municipalityAudit?.expectedMunicipalityCount || rows.length;
  const covered = quality?.municipalityAudit?.coveredMunicipalityCount || rows.filter((row) => row.count > 0).length;
  const sourceCoverage = quality?.sourceCoverage;

  return (
    <section className="mb-12 overflow-hidden rounded-[2rem] border border-slate-200/70 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-950 px-6 py-6 text-white lg:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold tracking-[0.22em] text-slate-200 uppercase">
              <DatabaseZap size={14} />
              Collection Status
            </div>
            <h3 className="mt-4 text-2xl font-semibold tracking-[0.04em]">自治体別 取得状況</h3>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">
              件数だけでなく、収集エラー、保持データ、取得元の種類をまとめて見ます。ここが赤い自治体は、案件が存在しないのではなく取得確認が必要です。
            </p>
          </div>
          <div className="grid grid-cols-4 gap-3 text-right">
            <div>
              <p className="text-[9px] tracking-[0.2em] text-slate-400 uppercase">対象</p>
              <p className="mt-1 text-xl tabular-nums">{covered}/{expected}</p>
            </div>
            <div>
              <p className="text-[9px] tracking-[0.2em] text-slate-400 uppercase">OK</p>
              <p className="mt-1 text-xl tabular-nums text-emerald-300">{okCount}</p>
            </div>
            <div>
              <p className="text-[9px] tracking-[0.2em] text-slate-400 uppercase">注意</p>
              <p className="mt-1 text-xl tabular-nums text-amber-300">{watchCount}</p>
            </div>
            <div>
              <p className="text-[9px] tracking-[0.2em] text-slate-400 uppercase">要確認</p>
              <p className="mt-1 text-xl tabular-nums text-rose-300">{riskCount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-b border-slate-100 bg-slate-50 px-6 py-4 text-xs tracking-[0.08em] text-slate-500 lg:grid-cols-[1fr_auto] lg:px-8">
        <p>最終品質記録: {formatGeneratedAt(quality?.generatedAt)}</p>
        <p>赤: 収集エラー・未取得・必須ソース欠落 / 黄: 薄い取得または保持データ / 緑: 通常取得</p>
        {sourceCoverage ? (
          <p className="lg:col-span-2">
            必須ソース監視: {sourceCoverage.okCount}/{sourceCoverage.activeCount} OK
            {sourceCoverage.missingErrorCount > 0 || sourceCoverage.missingWarningCount > 0
              ? ` / 不足 ${sourceCoverage.missingErrorCount + sourceCoverage.missingWarningCount}`
              : ' / 不足なし'}
          </p>
        ) : null}
      </div>

      <div className="divide-y divide-slate-100">
        {rows.map((row) => {
          const meta = STATUS_META[row.status];
          const Icon = meta.icon;
          return (
            <div key={row.municipality} className="grid gap-4 px-6 py-5 transition hover:bg-slate-50/80 lg:grid-cols-[180px_1fr_280px] lg:items-center lg:px-8">
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] ${meta.className}`}>
                  <Icon size={13} />
                  {meta.label}
                </span>
                <div>
                  <p className="text-sm font-semibold tracking-[0.06em] text-slate-950">{row.municipality}</p>
                  <p className="mt-1 text-[10px] tracking-[0.14em] text-slate-400 uppercase">{row.latestDate || 'latest unknown'}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-sm md:grid-cols-5">
                <div>
                  <p className="text-[9px] tracking-[0.18em] text-slate-400 uppercase">掲載</p>
                  <p className="mt-1 font-semibold tabular-nums text-slate-900">{row.count}件</p>
                </div>
                <div>
                  <p className="text-[9px] tracking-[0.18em] text-slate-400 uppercase">受付中</p>
                  <p className="mt-1 font-semibold tabular-nums text-slate-900">{row.openCount}</p>
                </div>
                <div>
                  <p className="text-[9px] tracking-[0.18em] text-slate-400 uppercase">落札</p>
                  <p className="mt-1 font-semibold tabular-nums text-slate-900">{row.awardedCount}</p>
                </div>
                <div>
                  <p className="text-[9px] tracking-[0.18em] text-slate-400 uppercase">増減</p>
                  <p className={`mt-1 font-semibold tabular-nums ${row.changeFromPrevious && row.changeFromPrevious < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                    {typeof row.changeFromPrevious === 'number' ? (row.changeFromPrevious > 0 ? `+${row.changeFromPrevious}` : row.changeFromPrevious) : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] tracking-[0.18em] text-slate-400 uppercase">取得元</p>
                  <p className="mt-1 truncate text-xs text-slate-700">{row.sourceLabels.length ? row.sourceLabels.join(' / ') : '未判定'}</p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-6 text-slate-600">
                <div className="flex items-start gap-2">
                  <FileSearch size={14} className="mt-1 shrink-0 text-slate-400" />
                  <div>
                    <p>
                      {row.issue
                        ? cleanIssueMessage(row.issue.message)
                        : row.sourceHealth?.status === 'missing'
                          ? `必須ソース不足: ${row.sourceHealth.missing.map(readableSourceLabel).join(' / ')}`
                          : row.retained
                            ? '前回保持データを含みます。最新取得と差分確認が必要です。'
                            : row.count <= 2
                              ? '取得件数が薄いため、対象ページの確認を推奨します。'
                              : '通常取得できています。'}
                    </p>
                    {row.sourceHealth ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {row.sourceHealth.required.map((source) => {
                          const count = row.sourceHealth?.counts[source] || 0;
                          const missingSource = count < 1;
                          return (
                            <span
                              key={source}
                              className={`rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-[0.1em] ${
                                missingSource
                                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                                  : 'border-emerald-100 bg-emerald-50 text-emerald-700'
                              }`}
                            >
                              {readableSourceLabel(source)} {count}
                            </span>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

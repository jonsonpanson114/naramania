import type { BiddingItem } from '@/types/bidding';
import { matchesPracticalFilter } from '@/lib/practical_filters';
import { AlertTriangle, CheckCircle2, MapPinned, ShieldAlert } from 'lucide-react';

type MunicipalityIssue = {
  municipality: string;
  level: 'warning' | 'error';
  message: string;
};

type QualitySummary = {
  sourceCoverage?: {
    results: Array<{
      expectation: {
        municipality: string;
      };
      status: 'ok' | 'missing';
      missingLinkIncludes: string[];
    }>;
  };
  municipalityAudit?: {
    missingMunicipalities?: string[];
    zeroCountMunicipalities?: string[];
    retainedFromPrevious?: string[];
    issues?: MunicipalityIssue[];
    breakdown?: Array<{
      municipality: string;
      count: number;
    }>;
  };
};

type OverviewStatus = 'ok' | 'watch' | 'risk';

type OverviewRow = {
  municipality: string;
  count: number;
  activeCount: number;
  openedCount: number;
  awardedCount: number;
  latestDate: string;
  status: OverviewStatus;
  reason: string;
};

const STATUS_META: Record<OverviewStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  ok: {
    label: '通常',
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

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

function buildRows(items: BiddingItem[], quality: QualitySummary | null): OverviewRow[] {
  const byMunicipality = new Map<string, BiddingItem[]>();
  for (const item of items) {
    const current = byMunicipality.get(item.municipality) || [];
    current.push(item);
    byMunicipality.set(item.municipality, current);
  }

  const issueMap = new Map((quality?.municipalityAudit?.issues || []).map((issue) => [issue.municipality, issue]));
  const retained = new Set(quality?.municipalityAudit?.retainedFromPrevious || []);
  const missing = new Set([
    ...(quality?.municipalityAudit?.missingMunicipalities || []),
    ...(quality?.municipalityAudit?.zeroCountMunicipalities || []),
  ]);
  const sourceMap = new Map(
    (quality?.sourceCoverage?.results || []).map((result) => [result.expectation.municipality, result]),
  );
  const names = new Set<string>([
    ...Array.from(byMunicipality.keys()),
    ...(quality?.municipalityAudit?.breakdown || []).map((entry) => entry.municipality),
    ...missing,
  ]);

  return Array.from(names).map((municipality) => {
    const list = byMunicipality.get(municipality) || [];
    const source = sourceMap.get(municipality);
    const issue = issueMap.get(municipality);
    const latestDate = list.map((item) => item.announcementDate).filter(Boolean).sort((a, b) => b.localeCompare(a))[0] || '';
    const activeCount = list.filter((item) => matchesPracticalFilter(item, 'active')).length;
    const openedCount = list.filter((item) => matchesPracticalFilter(item, 'opened')).length;
    const awardedCount = list.filter((item) => item.status === '落札').length;
    const isMissing = missing.has(municipality) || list.length === 0;
    const sourceMissing = source?.status === 'missing';
    const hasError = issue?.level === 'error';
    const status: OverviewStatus = isMissing || sourceMissing || hasError
      ? 'risk'
      : retained.has(municipality) || issue?.level === 'warning' || list.length <= 2
        ? 'watch'
        : 'ok';
    const reason = isMissing
      ? '取得なし'
      : sourceMissing
        ? '必須ソース不足'
        : issue
          ? issue.message.replace(/^\[[^\]]+\]\s*/, '').slice(0, 30)
          : retained.has(municipality)
            ? '前回保持あり'
            : list.length <= 2
              ? '件数少なめ'
              : '通常取得';

    return {
      municipality,
      count: list.length,
      activeCount,
      openedCount,
      awardedCount,
      latestDate,
      status,
      reason,
    };
  }).sort((a, b) => {
    const rank = { risk: 0, watch: 1, ok: 2 };
    return rank[a.status] - rank[b.status] || b.activeCount - a.activeCount || b.count - a.count || a.municipality.localeCompare(b.municipality, 'ja');
  });
}

export function MunicipalityStatusOverview({
  items,
  quality,
}: {
  items: BiddingItem[];
  quality: QualitySummary | null;
}) {
  const rows = buildRows(items, quality);
  const riskCount = rows.filter((row) => row.status === 'risk').length;
  const watchCount = rows.filter((row) => row.status === 'watch').length;

  return (
    <section id="municipality-status" className="rounded-[2rem] border border-stone-200/80 bg-white p-6 shadow-sm lg:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-600">
            <MapPinned size={14} />
            Municipality View
          </div>
          <h3 className="mt-4 text-2xl font-semibold tracking-[0.04em] text-stone-950">市町村別の状況をざっくり見る</h3>
          <p className="mt-2 max-w-3xl text-sm leading-7 tracking-[0.04em] text-stone-500">
            ここでは市町村ごとの掲載件数、受付中、開札済み、落札件数だけを軽く確認できます。詳細な監査情報は下のカバレッジ表に分けました。
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-5 py-4 text-right">
          <div>
            <p className="text-[9px] uppercase tracking-[0.2em] text-stone-400">自治体</p>
            <p className="mt-1 text-2xl tabular-nums text-stone-950">{rows.length}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-[0.2em] text-stone-400">注意</p>
            <p className="mt-1 text-2xl tabular-nums text-amber-700">{watchCount}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-[0.2em] text-stone-400">要確認</p>
            <p className="mt-1 text-2xl tabular-nums text-rose-700">{riskCount}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => {
          const meta = STATUS_META[row.status];
          const Icon = meta.icon;
          return (
            <div key={row.municipality} className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold tracking-[0.05em] text-stone-950">{row.municipality}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-stone-400">最新 {formatDate(row.latestDate)}</p>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-bold tracking-[0.14em] ${meta.className}`}>
                  <Icon size={12} />
                  {meta.label}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                <div className="rounded-xl bg-white px-2 py-2">
                  <p className="text-[9px] text-stone-400">掲載</p>
                  <p className="mt-1 text-lg tabular-nums text-stone-950">{row.count}</p>
                </div>
                <div className="rounded-xl bg-white px-2 py-2">
                  <p className="text-[9px] text-stone-400">受付</p>
                  <p className="mt-1 text-lg tabular-nums text-emerald-700">{row.activeCount}</p>
                </div>
                <div className="rounded-xl bg-white px-2 py-2">
                  <p className="text-[9px] text-stone-400">開札済</p>
                  <p className="mt-1 text-lg tabular-nums text-stone-700">{row.openedCount}</p>
                </div>
                <div className="rounded-xl bg-white px-2 py-2">
                  <p className="text-[9px] text-stone-400">落札</p>
                  <p className="mt-1 text-lg tabular-nums text-sky-700">{row.awardedCount}</p>
                </div>
              </div>

              <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-xs leading-5 text-stone-500">{row.reason}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

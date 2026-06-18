import { AlertTriangle, CheckCircle2, ExternalLink, RadioTower, ShieldCheck } from 'lucide-react';

export type LiveSourceAuditReport = {
  generatedAt?: string;
  currentItemCount?: number;
  checkedMunicipalities?: string[];
  scraperErrorCount?: number;
  scraperResults?: Array<{
    municipality: string;
    rawCount: number;
    keptCount: number;
    rejectedCount: number;
    errors: string[];
    warnings: string[];
  }>;
  coverage?: {
    checkedMunicipalityCount: number;
    expectedItemCount: number;
    matchedItemCount: number;
    missingItemCount: number;
    results: Array<{
      municipality: string;
      snapshotCount: number;
      expectedCount: number;
      matchedCount: number;
      missingCount: number;
      status: 'ok' | 'missing';
      missingItems: Array<{
        municipality: string;
        title: string;
        status: string;
        announcementDate: string;
        biddingDate?: string;
        link: string;
      }>;
    }>;
  };
};

function formatGeneratedAt(value?: string): string {
  if (!value) return '未実行';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getElapsedLabel(value?: string): string {
  if (!value) return '記録なし';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '日時不明';
  const hours = Math.round((Date.now() - date.getTime()) / (1000 * 60 * 60));
  if (hours < 1) return '1時間以内';
  if (hours < 24) return `${hours}時間前`;
  return `${Math.round(hours / 24)}日前`;
}

function firstMissingItem(report: LiveSourceAuditReport | null) {
  return report?.coverage?.results.flatMap((result) => result.missingItems || [])[0];
}

export function LiveSourceAuditPanel({ report }: { report: LiveSourceAuditReport | null }) {
  const missingCount = report?.coverage?.missingItemCount ?? 0;
  const errorCount = report?.scraperErrorCount ?? 0;
  const expectedCount = report?.coverage?.expectedItemCount ?? 0;
  const matchedCount = report?.coverage?.matchedItemCount ?? 0;
  const checkedMunicipalities = report?.checkedMunicipalities || [];
  const hasReport = Boolean(report?.generatedAt);
  const hasProblem = missingCount > 0 || errorCount > 0;
  const missing = firstMissingItem(report);

  return (
    <section className={`mb-12 overflow-hidden rounded-[2rem] border shadow-sm ${
      hasProblem
        ? 'border-rose-200 bg-rose-50/80'
        : hasReport
          ? 'border-emerald-200 bg-emerald-50/75'
          : 'border-amber-200 bg-amber-50/75'
    }`}>
      <div className="grid gap-0 lg:grid-cols-[1.05fr_1.4fr]">
        <div className="relative p-6 lg:p-8">
          <div className="absolute right-6 top-6 h-24 w-24 rounded-full bg-white/55 blur-2xl" />
          <div className="relative">
            <div className={`inline-flex items-center gap-2 rounded-full border bg-white/70 px-3 py-1 text-[10px] font-bold tracking-[0.22em] uppercase ${
              hasProblem ? 'border-rose-200 text-rose-700' : hasReport ? 'border-emerald-200 text-emerald-700' : 'border-amber-200 text-amber-800'
            }`}>
              <RadioTower size={14} />
              Live Source Audit
            </div>
            <h3 className="mt-4 text-2xl font-semibold tracking-[0.04em] text-slate-950">公開サイト差分監査</h3>
            <p className="mt-3 text-sm leading-7 tracking-[0.04em] text-slate-600">
              五條市・葛城市など、情報公開サイトを直接見に行ってDBと照合します。ここが赤なら、サイト側にはあるのにDBに無い案件があります。
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {checkedMunicipalities.length > 0 ? checkedMunicipalities.map((municipality) => (
                <span key={municipality} className="rounded-full border border-white/80 bg-white/70 px-3 py-1 text-[10px] font-bold tracking-[0.14em] text-slate-600">
                  {municipality}
                </span>
              )) : (
                <span className="rounded-full border border-white/80 bg-white/70 px-3 py-1 text-[10px] font-bold tracking-[0.14em] text-slate-500">
                  監査未実行
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-white/70 bg-white/65 p-6 lg:border-l lg:border-t-0 lg:p-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:min-w-[520px]">
              <div>
                <p className="text-[9px] tracking-[0.2em] text-slate-400 uppercase">最新監査</p>
                <p className="mt-1 text-sm font-semibold tracking-[0.05em] text-slate-900">{formatGeneratedAt(report?.generatedAt)}</p>
                <p className="mt-1 text-[10px] tracking-[0.12em] text-slate-400">{getElapsedLabel(report?.generatedAt)}</p>
              </div>
              <div>
                <p className="text-[9px] tracking-[0.2em] text-slate-400 uppercase">公開サイト候補</p>
                <p className="mt-1 text-2xl tabular-nums text-slate-950">{expectedCount}</p>
              </div>
              <div>
                <p className="text-[9px] tracking-[0.2em] text-slate-400 uppercase">DB一致</p>
                <p className="mt-1 text-2xl tabular-nums text-emerald-700">{matchedCount}</p>
              </div>
              <div>
                <p className="text-[9px] tracking-[0.2em] text-slate-400 uppercase">不足</p>
                <p className={`mt-1 text-2xl tabular-nums ${missingCount > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{missingCount}</p>
              </div>
            </div>
            <div className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold tracking-[0.16em] ${
              hasProblem
                ? 'border-rose-200 bg-rose-100 text-rose-800'
                : hasReport
                  ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
                  : 'border-amber-200 bg-amber-100 text-amber-900'
            }`}>
              {hasProblem ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
              {hasProblem ? '要確認' : hasReport ? 'OK' : '未実行'}
            </div>
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            {(report?.scraperResults || []).map((result) => {
              const hasMunicipalityProblem = result.errors.length > 0 || result.warnings.length > 0;
              return (
                <div key={result.municipality} className={`rounded-2xl border p-4 ${hasMunicipalityProblem ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-white/80'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold tracking-[0.06em] text-slate-950">{result.municipality}</p>
                      <p className="mt-1 text-[10px] tracking-[0.14em] text-slate-400 uppercase">raw {result.rawCount} / keep {result.keptCount} / reject {result.rejectedCount}</p>
                    </div>
                    <ShieldCheck size={17} className={hasMunicipalityProblem ? 'text-amber-700' : 'text-emerald-600'} />
                  </div>
                  {hasMunicipalityProblem ? (
                    <p className="mt-3 line-clamp-2 text-xs leading-6 text-amber-800">{[...result.errors, ...result.warnings][0]}</p>
                  ) : (
                    <p className="mt-3 text-xs leading-6 text-slate-500">公開サイト取得とDB照合は通過しています。</p>
                  )}
                </div>
              );
            })}
          </div>

          {missing ? (
            <a href={missing.link} className="mt-5 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-2 text-[11px] font-bold tracking-[0.12em] text-rose-700 transition hover:bg-rose-50">
              未掲載サンプルを見る
              <ExternalLink size={13} />
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

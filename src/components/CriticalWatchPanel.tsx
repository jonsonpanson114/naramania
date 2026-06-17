import type { BiddingItem } from '@/types/bidding';
import { evaluateCriticalWatch } from '@/lib/critical_watch';
import { AlertTriangle, CheckCircle2, ExternalLink, Radar } from 'lucide-react';

export function CriticalWatchPanel({ items }: { items: BiddingItem[] }) {
  const watch = evaluateCriticalWatch(items);
  const results = [...watch.projectResults, ...watch.sourceResults].filter((result) => result.status !== 'expired');
  const hasMissingError = watch.missingErrorCount > 0;
  const hasMissingWarning = watch.missingWarningCount > 0;

  return (
    <section className="mb-12 rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-sm lg:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-bold tracking-[0.22em] text-slate-600 uppercase">
            <Radar size={14} />
            Critical Watch
          </div>
          <h3 className="mt-4 text-2xl font-semibold tracking-[0.04em] text-slate-950">重要案件ウォッチ</h3>
          <p className="mt-2 max-w-3xl text-sm leading-7 tracking-[0.04em] text-slate-500">
            指摘済みの重要案件と情報公開サイトを毎回照合します。ここが赤なら、案件が無いのではなく収集漏れとして扱います。
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-right">
          <div>
            <p className="text-[9px] tracking-[0.2em] text-slate-400 uppercase">監視</p>
            <p className="mt-1 text-2xl tabular-nums text-slate-950">{watch.activeCount}</p>
          </div>
          <div>
            <p className="text-[9px] tracking-[0.2em] text-slate-400 uppercase">OK</p>
            <p className="mt-1 text-2xl tabular-nums text-emerald-600">{watch.okCount}</p>
          </div>
          <div>
            <p className="text-[9px] tracking-[0.2em] text-slate-400 uppercase">不足</p>
            <p className={`mt-1 text-2xl tabular-nums ${hasMissingError ? 'text-rose-600' : hasMissingWarning ? 'text-amber-600' : 'text-emerald-600'}`}>
              {watch.missingErrorCount + watch.missingWarningCount}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        {results.map((result) => {
          const isOk = result.status === 'ok';
          const isWarning = result.severity === 'warning';
          const href = result.matches[0]?.link;

          return (
            <div
              key={`${result.type}-${result.watch.id}`}
              className={`rounded-2xl border p-4 ${
                isOk
                  ? 'border-emerald-100 bg-emerald-50/60'
                  : isWarning
                    ? 'border-amber-200 bg-amber-50/80'
                    : 'border-rose-200 bg-rose-50/80'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  {isOk ? (
                    <CheckCircle2 size={17} className="text-emerald-600" />
                  ) : (
                    <AlertTriangle size={17} className={isWarning ? 'text-amber-700' : 'text-rose-700'} />
                  )}
                  <p className="text-sm font-semibold tracking-[0.06em] text-slate-950">{result.watch.label}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold tracking-[0.14em] ${
                  isOk ? 'bg-emerald-100 text-emerald-700' : isWarning ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-700'
                }`}>
                  {isOk ? 'OK' : isWarning ? '警告' : '不足'}
                </span>
              </div>
              <p className="mt-3 text-xs leading-6 tracking-[0.03em] text-slate-600">{result.message}</p>
              {href ? (
                <a
                  href={href}
                  className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.16em] text-slate-500 transition hover:text-emerald-700"
                >
                  詳細を見る
                  <ExternalLink size={12} />
                </a>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

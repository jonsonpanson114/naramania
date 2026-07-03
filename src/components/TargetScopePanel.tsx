import type { BiddingItem } from '@/types/bidding';
import { summarizeBiddingScope } from '@/lib/relevance_guard';
import { AlertTriangle, EyeOff, ShieldCheck } from 'lucide-react';

export function TargetScopePanel({ items }: { items: BiddingItem[] }) {
  const summary = summarizeBiddingScope(items);
  const hasNoise = summary.noiseCount > 0;

  return (
    <section className="mb-12 overflow-hidden rounded-[2rem] border border-emerald-900/10 bg-gradient-to-br from-emerald-950 via-slate-950 to-stone-900 text-white shadow-sm">
      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_420px] lg:p-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold tracking-[0.22em] text-emerald-100 uppercase">
            <ShieldCheck size={14} />
            Scope Guard
          </div>
          <h3 className="mt-4 text-2xl font-semibold tracking-[0.04em]">必要案件だけを残すガード</h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 tracking-[0.04em] text-emerald-50/75">
            このサイトは、建築本体・設計監理・トイレ改修などを優先します。土木、道路、舗装、水道、設備、空調、照明、エレベーター、外壁、防水系は対象外候補として監視し、一覧では初期表示から外します。
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4">
              <p className="text-[9px] tracking-[0.22em] text-emerald-100/60 uppercase">対象</p>
              <p className="mt-1 text-2xl tabular-nums text-emerald-200">{summary.targetCount}</p>
              <p className="mt-1 text-xs text-emerald-50/55">建築本体・設計監理</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4">
              <p className="text-[9px] tracking-[0.22em] text-amber-100/70 uppercase">要確認</p>
              <p className="mt-1 text-2xl tabular-nums text-amber-200">{summary.watchCount}</p>
              <p className="mt-1 text-xs text-emerald-50/55">建築文脈が薄い案件</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4">
              <p className="text-[9px] tracking-[0.22em] text-rose-100/70 uppercase">対象外候補</p>
              <p className={`mt-1 text-2xl tabular-nums ${hasNoise ? 'text-rose-200' : 'text-emerald-200'}`}>{summary.noiseCount}</p>
              <p className="mt-1 text-xs text-emerald-50/55">土木・設備・EV・外壁・防水 など</p>
            </div>
          </div>
        </div>

        <div className={`rounded-[1.5rem] border p-5 ${hasNoise ? 'border-rose-300/35 bg-rose-950/35' : 'border-emerald-300/20 bg-emerald-900/20'}`}>
          <div className="flex items-center gap-3">
            {hasNoise ? <AlertTriangle size={18} className="text-rose-200" /> : <EyeOff size={18} className="text-emerald-200" />}
            <div>
              <p className="text-sm font-semibold tracking-[0.08em]">{hasNoise ? '対象外候補が残っています' : '対象外候補は検出されていません'}</p>
              <p className="mt-1 text-xs leading-6 text-white/60">
                {hasNoise ? '一覧では初期非表示です。必要なら検索画面で表示を切り替えて確認できます。' : '現在の掲載データは、土木・設備・エレベーター・外壁・防水系の除外判定を通過しています。'}
              </p>
            </div>
          </div>

          {hasNoise ? (
            <div className="mt-4 space-y-3">
              {summary.noiseItems.slice(0, 4).map(({ item, assessment }) => (
                <a
                  key={item.id}
                  href={`/project/${item.id}`}
                  className="block rounded-2xl border border-white/10 bg-black/20 px-4 py-3 transition hover:border-rose-200/50 hover:bg-black/30"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] tracking-[0.16em] text-white/45">{item.municipality}</span>
                    <span className="rounded-full bg-rose-200/15 px-2 py-0.5 text-[9px] font-bold tracking-[0.16em] text-rose-100">
                      {assessment.reasons[0]}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-6 text-white/82">{item.title}</p>
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

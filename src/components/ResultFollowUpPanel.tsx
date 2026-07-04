import Link from 'next/link';
import { AlertTriangle, ArrowRight, CalendarClock, MapPin, Radar } from 'lucide-react';
import type { BiddingItem } from '@/types/bidding';
import { buildResultFollowUpSummary, type ResultFollowUpPriority } from '@/lib/result_follow_up';

const priorityTone: Record<ResultFollowUpPriority, {
  label: string;
  badge: string;
  card: string;
}> = {
  high: {
    label: '最優先',
    badge: 'bg-rose-100 text-rose-700 border-rose-200',
    card: 'border-rose-200 bg-rose-50/80',
  },
  medium: {
    label: '確認',
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
    card: 'border-amber-200 bg-amber-50/80',
  },
  low: {
    label: '待機',
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
    card: 'border-slate-200 bg-slate-50/80',
  },
};

function formatDate(dateStr?: string): string {
  if (!dateStr) return '未取得';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

export function ResultFollowUpPanel({ items }: { items: BiddingItem[] }) {
  const summary = buildResultFollowUpSummary(items);
  if (summary.totalCount === 0) return null;

  const topEntries = summary.entries.slice(0, 6);
  const topMunicipalities = summary.byMunicipality.slice(0, 6);

  return (
    <section className="mb-8 overflow-hidden rounded-[2rem] border border-amber-200/80 bg-white shadow-sm">
      <div className="grid gap-0 xl:grid-cols-[330px_minmax(0,1fr)]">
        <div className="border-b border-amber-100 bg-gradient-to-br from-amber-50 via-white to-rose-50 p-5 lg:p-7 xl:border-b-0 xl:border-r">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-800">
            <Radar size={14} />
            Result Follow-up
          </div>
          <h3 className="mt-4 text-2xl font-semibold tracking-[0.04em] text-slate-950">
            開札結果の追跡待ち
          </h3>
          <p className="mt-3 text-sm leading-7 tracking-[0.04em] text-slate-600">
            受付終了のまま、落札・不調まで確定できていない案件です。ここが減れば、開札結果の取りこぼしが減っています。
          </p>

          <div className="mt-6 grid grid-cols-3 gap-2 rounded-3xl border border-amber-100 bg-white/70 p-2 text-center">
            <div className="rounded-2xl bg-white px-3 py-3">
              <p className="text-[9px] uppercase tracking-[0.18em] text-slate-400">残件</p>
              <p className="mt-1 text-2xl tabular-nums text-slate-950">{summary.totalCount}</p>
            </div>
            <div className="rounded-2xl bg-white px-3 py-3">
              <p className="text-[9px] uppercase tracking-[0.18em] text-slate-400">最優先</p>
              <p className="mt-1 text-2xl tabular-nums text-rose-700">{summary.highCount}</p>
            </div>
            <div className="rounded-2xl bg-white px-3 py-3">
              <p className="text-[9px] uppercase tracking-[0.18em] text-slate-400">日付なし</p>
              <p className="mt-1 text-2xl tabular-nums text-amber-700">{summary.missingBiddingDateCount}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {topMunicipalities.map((row) => (
              <span
                key={row.municipality}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-100 bg-white px-2.5 py-1 text-[10px] font-bold tracking-[0.1em] text-slate-600"
              >
                <MapPin size={12} />
                {row.municipality}
                <span className="text-amber-700">{row.count}</span>
              </span>
            ))}
          </div>

          <Link
            href="/search?quick=resultFollowUp"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white transition hover:bg-amber-700"
          >
            一覧で追跡待ちを見る
            <ArrowRight size={14} />
          </Link>
        </div>

        <div className="grid gap-3 p-4 lg:p-5 md:grid-cols-2 xl:grid-cols-3">
          {topEntries.map((entry) => {
            const tone = priorityTone[entry.priority];
            return (
              <Link
                key={entry.item.id}
                href={`/project/${entry.item.id}`}
                className={`group rounded-[1.35rem] border p-4 transition hover:-translate-y-1 hover:shadow-md ${tone.card}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] ${tone.badge}`}>
                    {tone.label}
                  </span>
                  <span className="rounded-full border border-white/70 bg-white/70 px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] text-slate-500">
                    {entry.item.municipality}
                  </span>
                </div>
                <h4 className="mt-3 line-clamp-3 text-sm font-bold leading-6 tracking-[0.03em] text-slate-950 group-hover:text-amber-800">
                  {entry.item.title}
                </h4>
                <div className="mt-4 rounded-2xl border border-white/80 bg-white/70 p-3">
                  <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    <CalendarClock size={12} />
                    開札日
                  </p>
                  <p className="mt-1 text-sm font-bold tabular-nums text-slate-800">
                    {formatDate(entry.item.biddingDate)}
                  </p>
                  <p className="mt-1 text-[11px] leading-5 tracking-[0.03em] text-slate-500">
                    {entry.reason}
                  </p>
                </div>
              </Link>
            );
          })}

          {summary.entries.length > topEntries.length && (
            <div className="rounded-[1.35rem] border border-dashed border-slate-200 bg-slate-50 p-4 md:col-span-2 xl:col-span-3">
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                <AlertTriangle size={13} />
                ほかにも {summary.entries.length - topEntries.length} 件の結果追跡待ちがあります
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

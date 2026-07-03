import Link from 'next/link';
import { CheckCircle2, Clock3, ExternalLink, Sparkles, Trophy } from 'lucide-react';
import type { BiddingItem } from '@/types/bidding';
import {
  buildLatestOpeningResults,
  type OpeningResultUpdate,
  type OpeningResultUpdateReport,
} from '@/lib/opening_result_updates';

function formatDate(dateStr?: string): string {
  if (!dateStr) return '日程未取得';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

function formatGeneratedAt(dateStr?: string): string {
  if (!dateStr) return '更新時刻未取得';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getResultLabel(item: OpeningResultUpdate): string {
  if (item.kind === 'new_winner') return '落札者取得';
  if (item.kind === 'new_failure') return '不調取得';
  return '開札状態更新';
}

function getResultBody(item: OpeningResultUpdate): string {
  if (item.winningContractor) return item.winningContractor;
  if (item.status === '不調') return '不調として確認';
  return `${item.status}として確認`;
}

function resultSortValue(item: OpeningResultUpdate): string {
  return item.biddingDate || item.announcementDate || '';
}

function priorityScore(item: OpeningResultUpdate): number {
  const title = item.title.normalize('NFKC');
  if (/高校|学校|小学校|中学校|こども園|幼稚園|トイレ|便所/.test(title)) return 0;
  return 1;
}

function sortForDigest(items: OpeningResultUpdate[]): OpeningResultUpdate[] {
  return [...items].sort((a, b) =>
    priorityScore(a) - priorityScore(b)
    || resultSortValue(b).localeCompare(resultSortValue(a))
    || b.title.localeCompare(a.title, 'ja'),
  );
}

export function OpeningResultDigest({
  items,
  report,
}: {
  items: BiddingItem[];
  report?: OpeningResultUpdateReport | null;
}) {
  const freshUpdates = report?.updates || [];
  const latestResults = report?.latestResults?.length
    ? report.latestResults
    : buildLatestOpeningResults(items, 8);
  const sourceResults = freshUpdates.length > 0 ? sortForDigest(freshUpdates) : latestResults;
  const displayResults = sourceResults.slice(0, 6);

  if (displayResults.length === 0) return null;

  const winnerCount = sourceResults.filter((item) => Boolean(item.winningContractor)).length;
  const failureCount = sourceResults.filter((item) => item.status === '不調').length;
  const isFreshMode = freshUpdates.length > 0;
  const totalResultCount = isFreshMode ? freshUpdates.length : displayResults.length;

  return (
    <section className="mb-8 overflow-hidden rounded-[2rem] border border-emerald-200/80 bg-gradient-to-br from-emerald-950 via-stone-950 to-slate-950 text-white shadow-soft">
      <div className="grid gap-0 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="border-b border-white/10 p-5 lg:p-7 xl:border-b-0 xl:border-r">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/25 bg-emerald-200/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-100">
            <Sparkles size={14} />
            Opening Results
          </div>
          <h3 className="mt-4 text-3xl font-light leading-tight tracking-[0.08em]">
            こんな開札情報を取れたよ
          </h3>
          <p className="mt-3 text-sm leading-7 tracking-[0.04em] text-emerald-50/70">
            {isFreshMode
              ? '前回データには無かった落札者・不調などの開札結果を、今回の収集差分として表示します。'
              : '今回の新規差分がない時は、直近で確認済みの開札結果を表示します。'}
          </p>

          <div className="mt-6 grid grid-cols-3 gap-2 rounded-3xl border border-white/10 bg-white/10 p-2 text-center">
            <div className="rounded-2xl bg-white/10 px-3 py-3">
              <p className="text-[9px] uppercase tracking-[0.2em] text-emerald-100/70">
                {isFreshMode ? '今回新規' : '直近表示'}
              </p>
              <p className="mt-1 text-2xl font-light tabular-nums text-white">{totalResultCount}</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-3 py-3">
              <p className="text-[9px] uppercase tracking-[0.2em] text-emerald-100/70">落札者</p>
              <p className="mt-1 text-2xl font-light tabular-nums text-emerald-200">{winnerCount}</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-3 py-3">
              <p className="text-[9px] uppercase tracking-[0.2em] text-emerald-100/70">不調</p>
              <p className="mt-1 text-2xl font-light tabular-nums text-amber-200">{failureCount}</p>
            </div>
          </div>

          <p className="mt-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-50/50">
            <Clock3 size={13} />
            {formatGeneratedAt(report?.generatedAt)}
          </p>
        </div>

        <div className="grid gap-3 p-4 lg:p-5 md:grid-cols-2">
          {displayResults.map((item) => (
            <Link
              key={`${item.id}-${item.detectedAt}-${item.kind}`}
              href={`/project/${item.id}`}
              className="group rounded-[1.4rem] border border-white/10 bg-white/[0.08] p-4 shadow-sm transition hover:-translate-y-1 hover:border-emerald-200/60 hover:bg-white/[0.13]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-200 px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-emerald-950">
                  <Trophy size={12} />
                  {getResultLabel(item)}
                </span>
                <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] text-white/70">
                  {item.municipality}
                </span>
                <span className="ml-auto rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-[10px] font-bold tabular-nums tracking-[0.08em] text-white/70">
                  {formatDate(item.biddingDate)}
                </span>
              </div>

              <h4 className="mt-3 line-clamp-2 text-[15px] font-bold leading-7 tracking-[0.03em] text-white transition group-hover:text-emerald-100">
                {item.title}
              </h4>

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/15 p-3">
                <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-100/55">
                  <CheckCircle2 size={12} />
                  取得できた結果
                </p>
                <p className={`mt-1 line-clamp-1 text-sm font-bold tracking-[0.03em] ${item.winningContractor ? 'text-emerald-100' : 'text-amber-100'}`}>
                  {getResultBody(item)}
                </p>
              </div>

              <div className="mt-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">
                <span>公告 {formatDate(item.announcementDate)}</span>
                <span className="inline-flex items-center gap-1 transition group-hover:text-emerald-100">
                  詳細
                  <ExternalLink size={12} />
                </span>
              </div>
            </Link>
          ))}

          {sourceResults.length > displayResults.length && (
            <div className="rounded-[1.4rem] border border-dashed border-white/15 bg-white/[0.05] p-4 md:col-span-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-100/60">
                ほかにも {sourceResults.length - displayResults.length} 件の開札結果を取得済み
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {sourceResults.slice(6, 12).map((item) => (
                  <Link
                    key={`more-${item.id}-${item.detectedAt}-${item.kind}`}
                    href={`/project/${item.id}`}
                    className="rounded-full border border-white/10 bg-black/15 px-3 py-1.5 text-[10px] font-bold tracking-[0.08em] text-white/70 transition hover:border-emerald-200/50 hover:text-emerald-100"
                  >
                    {item.municipality} / {formatDate(item.biddingDate)} / {getResultBody(item)}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

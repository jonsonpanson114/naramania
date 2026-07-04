import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Radar, School, Trophy } from 'lucide-react';
import type { BiddingItem } from '@/types/bidding';
import { countPracticalFilter, matchesPracticalFilter, type PracticalFilter } from '@/lib/practical_filters';

type QueueFilter = Exclude<PracticalFilter, 'all'>;

type WorkQueueCard = {
  id: QueueFilter;
  label: string;
  eyebrow: string;
  description: string;
  href: string;
  icon: LucideIcon;
  tone: 'rose' | 'amber' | 'emerald' | 'slate';
};

const WORK_QUEUE: WorkQueueCard[] = [
  {
    id: 'missingWinner',
    label: '落札者未取得',
    eyebrow: '最優先確認',
    description: '落札済みなのに落札者が空の案件。結果PDFや公開サイトの再確認対象です。',
    href: '/search?quick=missingWinner',
    icon: AlertTriangle,
    tone: 'rose',
  },
  {
    id: 'resultFollowUp',
    label: '結果追跡待ち',
    eyebrow: '開札後追い',
    description: '受付終了のまま落札・不調まで確定できていない案件。次に潰すべき残タスクです。',
    href: '/search?quick=resultFollowUp',
    icon: Radar,
    tone: 'amber',
  },
  {
    id: 'schoolToilet',
    label: '学校・トイレ改修',
    eyebrow: '重点案件',
    description: '五條市立小学校トイレ改修のように、建築寄りで見逃したくない案件です。',
    href: '/search?quick=schoolToilet',
    icon: School,
    tone: 'amber',
  },
  {
    id: 'opened',
    label: '開札済み',
    eyebrow: '結果確認',
    description: '開札日を過ぎた案件と、落札・不調・受付終了になった案件を確認します。',
    href: '/search?quick=opened',
    icon: Trophy,
    tone: 'slate',
  },
  {
    id: 'active',
    label: '受付中',
    eyebrow: '営業確認',
    description: '今から追える受付中案件。不要な土木・設備は一覧側の対象範囲ガードで抑えます。',
    href: '/search?quick=active',
    icon: Clock3,
    tone: 'emerald',
  },
];

const toneStyles: Record<WorkQueueCard['tone'], {
  card: string;
  icon: string;
  badge: string;
  count: string;
  link: string;
}> = {
  rose: {
    card: 'border-rose-200 bg-rose-50/80',
    icon: 'bg-rose-100 text-rose-700',
    badge: 'border-rose-200 bg-white/75 text-rose-700',
    count: 'text-rose-700',
    link: 'text-rose-700 hover:text-rose-900',
  },
  amber: {
    card: 'border-amber-200 bg-amber-50/80',
    icon: 'bg-amber-100 text-amber-800',
    badge: 'border-amber-200 bg-white/75 text-amber-800',
    count: 'text-amber-800',
    link: 'text-amber-800 hover:text-amber-950',
  },
  emerald: {
    card: 'border-emerald-200 bg-emerald-50/75',
    icon: 'bg-emerald-100 text-emerald-700',
    badge: 'border-emerald-200 bg-white/75 text-emerald-700',
    count: 'text-emerald-700',
    link: 'text-emerald-700 hover:text-emerald-900',
  },
  slate: {
    card: 'border-slate-200 bg-slate-50/85',
    icon: 'bg-slate-200 text-slate-700',
    badge: 'border-slate-200 bg-white/75 text-slate-700',
    count: 'text-slate-800',
    link: 'text-slate-700 hover:text-slate-950',
  },
};

function sortForReview(a: BiddingItem, b: BiddingItem): number {
  const bidding = (b.biddingDate || '').localeCompare(a.biddingDate || '');
  if (bidding !== 0) return bidding;
  return (b.announcementDate || '').localeCompare(a.announcementDate || '');
}

function getSampleItems(items: BiddingItem[], filter: QueueFilter): BiddingItem[] {
  return items
    .filter((item) => matchesPracticalFilter(item, filter))
    .sort(sortForReview)
    .slice(0, 2);
}

export function PracticalWorkQueue({ items }: { items: BiddingItem[] }) {
  const missingWinnerCount = countPracticalFilter(items, 'missingWinner');
  const resultFollowUpCount = countPracticalFilter(items, 'resultFollowUp');
  const schoolToiletCount = countPracticalFilter(items, 'schoolToilet');
  const openedCount = countPracticalFilter(items, 'opened');
  const activeCount = countPracticalFilter(items, 'active');
  const reviewCount = missingWinnerCount + resultFollowUpCount + schoolToiletCount;

  const counts: Record<QueueFilter, number> = {
    missingWinner: missingWinnerCount,
    resultFollowUp: resultFollowUpCount,
    schoolToilet: schoolToiletCount,
    opened: openedCount,
    active: activeCount,
  };

  return (
    <section className="mb-12 rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-sm lg:p-8">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-bold tracking-[0.22em] text-slate-600 uppercase">
            <CheckCircle2 size={14} />
            Practical Queue
          </div>
          <h3 className="mt-4 text-2xl font-semibold tracking-[0.04em] text-slate-950">今日の確認順</h3>
          <p className="mt-2 text-sm leading-7 tracking-[0.04em] text-slate-500">
            必要な案件だけを見るための入口です。まず落札者未取得と学校トイレを確認し、次に開札済みと受付中を追います。
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 px-5 py-4 text-right">
          <div>
            <p className="text-[9px] tracking-[0.2em] text-slate-400 uppercase">要確認</p>
            <p className="mt-1 text-2xl tabular-nums text-rose-700">{reviewCount}</p>
          </div>
          <div>
            <p className="text-[9px] tracking-[0.2em] text-slate-400 uppercase">開札済み</p>
            <p className="mt-1 text-2xl tabular-nums text-slate-900">{openedCount}</p>
          </div>
          <div>
            <p className="text-[9px] tracking-[0.2em] text-slate-400 uppercase">受付中</p>
            <p className="mt-1 text-2xl tabular-nums text-emerald-700">{activeCount}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-5 md:grid-cols-2">
        {WORK_QUEUE.map((queue) => {
          const Icon = queue.icon;
          const tone = toneStyles[queue.tone];
          const samples = getSampleItems(items, queue.id);
          const count = counts[queue.id];

          return (
            <Link
              key={queue.id}
              href={queue.href}
              className={`group flex min-h-[260px] flex-col rounded-[1.6rem] border p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md ${tone.card}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tone.icon}`}>
                  <Icon size={20} />
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[9px] font-bold tracking-[0.16em] uppercase ${tone.badge}`}>
                  {queue.eyebrow}
                </span>
              </div>

              <div className="mt-5 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold tracking-[0.18em] text-slate-400 uppercase">{queue.label}</p>
                  <p className={`mt-1 text-4xl font-light tabular-nums tracking-tight ${tone.count}`}>{count}</p>
                </div>
                <ArrowRight size={18} className={`mb-2 transition group-hover:translate-x-1 ${tone.link}`} />
              </div>

              <p className="mt-4 text-xs leading-6 tracking-[0.03em] text-slate-600">{queue.description}</p>

              <div className="mt-auto pt-4">
                <div className="space-y-2 border-t border-white/70 pt-4">
                  {samples.length > 0 ? samples.map((item) => (
                    <div key={item.id} className="rounded-xl bg-white/65 px-3 py-2">
                      <div className="flex items-center justify-between gap-3 text-[9px] font-bold tracking-[0.14em] text-slate-400">
                        <span>{item.municipality}</span>
                        <span>{item.biddingDate || item.announcementDate}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-5 tracking-[0.03em] text-slate-700">{item.title}</p>
                    </div>
                  )) : (
                    <p className="rounded-xl bg-white/65 px-3 py-3 text-[11px] tracking-[0.04em] text-slate-400">該当案件はありません。</p>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

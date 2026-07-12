import { AppShell } from '@/components/AppShell';
import { Header } from '@/components/Header';
import { AlertNotificationPanel } from '@/components/AlertNotificationPanel';
import { OpeningResultDigest } from '@/components/OpeningResultDigest';
import { ResultFollowUpPanel } from '@/components/ResultFollowUpPanel';
import { RecentChangesPanel } from '@/components/RecentChangesPanel';
import { WatchResultsPanel } from '@/components/WatchResultsPanel';
import { SavedCountBadge } from '@/components/SavedCountBadge';
import { NewsSection } from '@/components/NewsSection';
import { NewsTicker } from '@/components/NewsTicker';
import { getShortBiddingLabel } from '@/lib/bidding_schedule';
import { countPracticalFilter } from '@/lib/practical_filters';
import { loadDashboardData } from '@/lib/dashboard_data';
import { Activity, AlertTriangle, CalendarClock, ChartColumn, MessageSquareText, Search, Briefcase } from 'lucide-react';
import Link from 'next/link';

function getDaysUntilLabel(dateStr?: string): string {
  if (!dateStr) return '日程未定';
  const today = new Date();
  const target = new Date(dateStr);
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (Number.isNaN(diff)) return '日程未定';
  if (diff < 0) return '終了済み';
  if (diff === 0) return '本日';
  if (diff === 1) return '明日';
  return `${diff}日後`;
}

// Async Server Component
export default async function Home() {
  const { allItems, qualitySummary, liveAuditReport, openingResultReport } = loadDashboardData();

  const today = new Date().toISOString().split('T')[0];

  const oneWeekLater = new Date();
  oneWeekLater.setDate(oneWeekLater.getDate() + 7);
  const urgentCount = allItems.filter(item => {
    if (!item.biddingDate) return false;
    const deadline = new Date(item.biddingDate);
    const now = new Date();
    return deadline > now && deadline <= oneWeekLater;
  }).length;

  const activeCount = countPracticalFilter(allItems, 'active');
  const resultFollowUpCount = countPracticalFilter(allItems, 'resultFollowUp');

  const upcomingBiddings = allItems
    .filter(item => item.biddingDate && item.status !== '落札' && item.status !== '受付終了')
    .filter(item => item.biddingDate! >= today)
    .sort((a, b) => (a.biddingDate || '').localeCompare(b.biddingDate || ''))
    .slice(0, 4);

  // 運用サマリ（詳細は /admin へ）
  const latestQualityDate = qualitySummary?.generatedAt
    ? new Date(qualitySummary.generatedAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
    : null;
  const auditIssueCount =
    (qualitySummary?.municipalityAudit?.issues || []).filter(issue => issue.level === 'error').length
    + (liveAuditReport?.coverage?.missingItemCount ?? 0)
    + (liveAuditReport?.scraperErrorCount ?? 0);
  const operationsHealthy = auditIssueCount === 0;

  return (
    <AppShell>
        <NewsTicker />
        <Header />

        <div className="mb-6 rounded-[2rem] border border-amber-200/70 bg-gradient-to-br from-stone-950 via-stone-900 to-amber-950 p-5 text-white shadow-soft lg:p-7">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold tracking-[0.24em] text-amber-100 uppercase">
                <CalendarClock size={14} />
                Today Focus
              </div>
              <h3 className="mt-4 text-3xl font-light tracking-[0.08em]">今日見るところ</h3>
              <p className="mt-3 text-sm leading-7 tracking-[0.05em] text-stone-200/75">
                まず新着、次に直近開札、最後に結果と追跡待ちを確認します。案件の全件一覧は「案件検索」に移しました。
              </p>
            </div>
            <div className="grid w-full max-w-xl grid-cols-3 gap-2 rounded-3xl border border-white/10 bg-white/10 p-2 text-center backdrop-blur">
              <Link href="/search?quick=active" className="rounded-2xl bg-white/10 px-3 py-3 transition hover:bg-white/15">
                <p className="text-[9px] tracking-[0.2em] text-stone-300 uppercase">受付中</p>
                <p className="mt-1 text-2xl font-light tabular-nums text-emerald-200">{activeCount}</p>
              </Link>
              <Link href="/search?quick=active" className="rounded-2xl bg-white/10 px-3 py-3 transition hover:bg-white/15">
                <p className="text-[9px] tracking-[0.2em] text-stone-300 uppercase">直近開札</p>
                <p className="mt-1 text-2xl font-light tabular-nums text-amber-200">{urgentCount}</p>
              </Link>
              <Link href="/search?quick=resultFollowUp" className="rounded-2xl bg-white/10 px-3 py-3 transition hover:bg-white/15">
                <p className="text-[9px] tracking-[0.2em] text-stone-300 uppercase">追跡待ち</p>
                <p className="mt-1 text-2xl font-light tabular-nums text-rose-200">{resultFollowUpCount}</p>
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-3 xl:grid-cols-4 md:grid-cols-2">
            {upcomingBiddings.map((item) => (
              <a
                key={item.id}
                href={`/project/${item.id}`}
                className="group rounded-[1.3rem] border border-white/10 bg-white/[0.08] p-4 shadow-sm transition hover:-translate-y-1 hover:border-amber-200/50 hover:bg-white/[0.12]"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-full bg-amber-200 px-2.5 py-1 text-[10px] font-bold tracking-[0.18em] text-stone-950 uppercase">
                    {getDaysUntilLabel(item.biddingDate)}
                  </span>
                  <span className="text-[10px] tracking-[0.18em] text-stone-300 uppercase">{item.municipality}</span>
                </div>
                <h4 className="mt-4 line-clamp-3 text-[14px] leading-7 tracking-[0.03em] text-white transition group-hover:text-amber-100">
                  {item.title}
                </h4>
                <div className="mt-4 rounded-2xl bg-black/15 p-3">
                  <div className="flex items-center justify-between text-[10px] tracking-wider text-stone-300/70 font-mono">
                    <span>{getShortBiddingLabel(item)}</span>
                    <span className="font-bold text-stone-100">{item.biddingDate}</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>

        <WatchResultsPanel items={allItems} />

        <RecentChangesPanel items={allItems} />

        <div className="mb-8 grid gap-2 md:grid-cols-4">
          <Link href="/search" className="group rounded-2xl border border-stone-200 bg-white/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-700"><Search size={12} /> Search</p>
            <p className="mt-2 text-base font-semibold tracking-[0.05em] text-primary">案件検索</p>
            <p className="mt-1 text-xs leading-5 text-secondary/55">全案件の一覧・絞り込み</p>
          </Link>
          <Link href="/analytics" className="group rounded-2xl border border-stone-200 bg-white/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700"><ChartColumn size={12} /> Analytics</p>
            <p className="mt-2 text-base font-semibold tracking-[0.05em] text-primary">傾向を分析する</p>
            <p className="mt-1 text-xs leading-5 text-secondary/55">落札者ランキング・価格相場</p>
          </Link>
          <Link href="/saved" className="group rounded-2xl border border-stone-200 bg-white/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-sky-700"><Briefcase size={12} /> Sales</p>
            <p className="mt-2 text-base font-semibold tracking-[0.05em] text-primary">営業管理</p>
            <SavedCountBadge />
          </Link>
          <Link href="/chat" className="group rounded-2xl border border-stone-200 bg-white/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-300 hover:shadow-md">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-rose-700"><MessageSquareText size={12} /> Chat</p>
            <p className="mt-2 text-base font-semibold tracking-[0.05em] text-primary">質問して探す</p>
            <p className="mt-1 text-xs leading-5 text-secondary/55">市町村名や案件名で質問</p>
          </Link>
        </div>

        <AlertNotificationPanel items={allItems} />

        <OpeningResultDigest items={allItems} report={openingResultReport} />

        <ResultFollowUpPanel items={allItems} />

        {/* News Section */}
        <NewsSection />

        {/* 運用サマリ（詳細は /admin） */}
        <div className="mt-12">
          <Link
            href="/admin"
            className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 text-sm transition hover:shadow-md ${operationsHealthy
              ? 'border-stone-200 bg-white/70 text-secondary/70 hover:border-stone-300'
              : 'border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-400'
            }`}
          >
            <span className="flex items-center gap-2 tracking-[0.06em]">
              {operationsHealthy
                ? <Activity size={15} className="text-green-600" />
                : <AlertTriangle size={15} className="text-amber-600" />}
              データ更新: {latestQualityDate || '-'}
              {operationsHealthy
                ? ' / 収集・監査は正常です'
                : ` / 要確認 ${auditIssueCount}件`}
            </span>
            <span className="text-xs font-bold tracking-[0.14em] underline-offset-4 hover:underline">運用状況を見る →</span>
          </Link>
        </div>

    </AppShell>
  );
}

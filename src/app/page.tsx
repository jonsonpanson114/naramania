import { AppShell } from '@/components/AppShell';
import { Header } from '@/components/Header';
import { AlertNotificationPanel } from '@/components/AlertNotificationPanel';
import { TodayFocusPanel } from '@/components/TodayFocusPanel';
import { WatchResultsPanel } from '@/components/WatchResultsPanel';
import { BiddingTable } from '@/components/BiddingTable';
import { NewsSection } from '@/components/NewsSection';
import { NewsTicker } from '@/components/NewsTicker';
import { countPracticalFilter } from '@/lib/practical_filters';
import { buildLatestOpeningResults } from '@/lib/opening_result_updates';
import { buildResultFollowUpSummary } from '@/lib/result_follow_up';
import { loadDashboardData } from '@/lib/dashboard_data';
import { Activity, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

// Async Server Component
export default async function Home() {
  const { allItems, qualitySummary, liveAuditReport, openingResultReport } = loadDashboardData();

  const today = new Date().toISOString().split('T')[0];

  const activeCount = countPracticalFilter(allItems, 'active');

  // 「直近開札」は7日以内。サマリの数字とタブの中身を同じ集合から出す
  const oneWeekLater = new Date();
  oneWeekLater.setDate(oneWeekLater.getDate() + 7);
  const oneWeekLaterIso = `${oneWeekLater.getFullYear()}-${String(oneWeekLater.getMonth() + 1).padStart(2, '0')}-${String(oneWeekLater.getDate()).padStart(2, '0')}`;

  const upcomingBiddings = allItems
    .filter(item => item.biddingDate && item.status !== '落札' && item.status !== '受付終了')
    .filter(item => item.biddingDate! >= today && item.biddingDate! <= oneWeekLaterIso)
    .sort((a, b) => (a.biddingDate || '').localeCompare(b.biddingDate || ''));

  // Today Focus のタブに渡す一覧（従来の各パネルと同じ算出方法）
  const openingResults = openingResultReport?.updates?.length
    ? openingResultReport.updates
    : (openingResultReport?.latestResults?.length
        ? openingResultReport.latestResults
        : buildLatestOpeningResults(allItems, 8));
  const followUpEntries = buildResultFollowUpSummary(allItems).entries;

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

        <TodayFocusPanel
          items={allItems}
          upcoming={upcomingBiddings}
          openingResults={openingResults}
          followUp={followUpEntries}
          activeCount={activeCount}
        />

        <WatchResultsPanel items={allItems} />

        <AlertNotificationPanel items={allItems} />

        {/* 案件一覧 */}
        <div className="mt-10">
          <BiddingTable items={allItems} />
        </div>

        {/* News Section（一覧の下。ニュースは上部ティッカーと /news が主動線） */}
        <NewsSection pageSize={5} showAllLink />

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

import { AppShell } from '@/components/AppShell';
import { AlertNotificationPanel } from '@/components/AlertNotificationPanel';
import { TodayFocusPanel } from '@/components/TodayFocusPanel';
import { DataFreshnessBanner } from '@/components/DataFreshnessBanner';
import { WatchResultsPanel } from '@/components/WatchResultsPanel';
import { ProjectListLink } from '@/components/ProjectListLink';
import { NewsSection } from '@/components/NewsSection';
import { countPracticalFilter } from '@/lib/practical_filters';
import { buildLatestOpeningResults } from '@/lib/opening_result_updates';
import { buildResultFollowUpSummary } from '@/lib/result_follow_up';
import { getDataFreshness, getStaleMunicipalities } from '@/lib/data_freshness';
import { loadDashboardData } from '@/lib/dashboard_data';
import { addDaysJstDateKey, toJstDateKey } from '@/lib/jst_date';
import { getMonthlyAnnouncements } from '@/lib/monthly_announcements';
import type { BiddingItem } from '@/types/bidding';
import { Activity, AlertTriangle, ArrowRight } from 'lucide-react';
import Link from 'next/link';

function OpeningSchedule({ items }: { items: BiddingItem[] }) {
  return (
    <section className="paper-panel p-2.5" aria-labelledby="opening-schedule">
      <h2 id="opening-schedule" className="paper-heading">直近の開札</h2>
      <p className="px-2.5 pt-2 text-xs leading-5 text-secondary">本日から7日後まで</p>
      {items.length > 0 ? (
        <ul className="mt-1 divide-y divide-border">
          {items.slice(0, 5).map(item => (
            <li key={item.id} className="odd:bg-paper-stripe">
              <Link href={`/project/${item.id}`} className="group grid grid-cols-[3.25rem_minmax(0,1fr)] gap-2.5 rounded px-2.5 py-2 hover:bg-paper-tint">
                <time dateTime={item.biddingDate} className="text-sm leading-6 font-bold text-accent tabular-nums">
                  {new Date(item.biddingDate!).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' })}
                </time>
                <span className="min-w-0">
                  <span className="block text-sm leading-6 font-semibold break-words group-hover:underline">{item.title}</span>
                  <span className="block text-xs leading-5 text-secondary">{item.municipality}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-2.5 py-3 text-sm leading-6 text-secondary">対象期間の開札予定はありません。</p>
      )}
      <Link href="/search?quick=upcomingBidding" className="flex w-fit items-center gap-1.5 rounded px-2.5 pt-2.5 pb-1.5 text-sm font-bold text-accent hover:underline">
        開札予定の一覧 <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </section>
  );
}

function AnnouncementTrend({ months }: { months: ReturnType<typeof getMonthlyAnnouncements>['months'] }) {
  const max = Math.max(1, ...months.map(entry => entry.count));

  return (
    <section className="paper-panel p-2.5" aria-labelledby="announcement-trend">
      <h2 id="announcement-trend" className="paper-heading">発注の動き</h2>
      <div className="grid gap-3 px-2.5 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(10rem,1fr)] sm:items-center">
        <ul className="grid min-w-0 grid-cols-6 gap-1.5 border-b border-border pb-1.5 text-center" aria-label="月別の公告件数">
          {months.map(({ month, count }, index) => (
            <li key={month} className="min-w-0">
              <div className="flex h-24 flex-col justify-end">
                <span className="pb-0.5 text-xs font-bold tabular-nums">{count}<span className="sr-only">件</span></span>
                <div aria-hidden="true" className={`mx-auto w-4/5 max-w-14 rounded-t ${index === months.length - 1 ? 'bg-emerald-700/55' : 'bg-accent'}`} style={{ height: `${count / max * 75}%` }} />
              </div>
              <time dateTime={month} className="mt-1 block text-xs text-secondary tabular-nums"><span className="sr-only">{month.slice(0, 4)}年</span>{Number(month.slice(5))}月</time>
            </li>
          ))}
        </ul>
        <div>
          <p className="text-sm leading-6 text-secondary">直近6か月に掲載した案件を公告日で集計。今月は集計途中です。</p>
          <Link href="/analytics" className="mt-2 inline-flex items-center gap-1.5 rounded text-sm font-bold text-accent hover:underline">
            市場分析を見る <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

// Async Server Component
export default async function Home() {
  const { allItems, qualitySummary, liveAuditReport, openingResultReport } = loadDashboardData();

  // UTCで動くサーバーだと toISOString() は日本時間 0:00〜9:00 のあいだ前日を返し、
  // 「直近開札」の期間が丸一日ずれる。日本時間で組み立てる。
  const today = toJstDateKey();

  const activeCount = countPracticalFilter(allItems, 'active');

  // 「直近開札」は7日以内。サマリの数字とタブの中身を同じ集合から出す。
  // 起点(today)と終点で基準がずれないよう、どちらも日本時間で作る。
  const oneWeekLaterIso = addDaysJstDateKey(7);

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
  const { months } = getMonthlyAnnouncements(allItems, today);

  // 運用サマリ（詳細は /admin へ）
  const latestQualityDate = qualitySummary?.generatedAt
    ? new Date(qualitySummary.generatedAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' })
    : null;
  const auditIssueCount =
    (qualitySummary?.municipalityAudit?.issues || []).filter(issue => issue.level === 'error').length
    + (liveAuditReport?.coverage?.missingItemCount ?? 0)
    + (liveAuditReport?.scraperErrorCount ?? 0);
  // 監査に問題が無くても、収集自体が止まっていれば「正常」と言ってはいけない。
  // 奈良県のように一部の自治体だけ止まる場合もあるため両方見る。
  const dataFreshness = getDataFreshness(qualitySummary?.generatedAt);
  const staleMunicipalities = getStaleMunicipalities(qualitySummary?.municipalityLastScraped);
  const collectionStopped = dataFreshness.isStale || staleMunicipalities.length > 0;
  const operationsHealthy = auditIssueCount === 0 && !collectionStopped;

  return (
    <AppShell updatedAt={qualitySummary?.generatedAt}>
        <header className="mb-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 sm:mb-4">
          <h1 className="paper-title">奈良の動き、朝の3分で。</h1>
          <p className="paper-eyebrow hidden border-l border-border pl-4 sm:block">新着公告・開札結果・奈良の建設ニュース</p>
        </header>

        <DataFreshnessBanner
          generatedAt={qualitySummary?.generatedAt}
          municipalityLastScraped={qualitySummary?.municipalityLastScraped}
        />

        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
          <div className="grid min-w-0 gap-4">
            <TodayFocusPanel
              items={allItems}
              upcoming={upcomingBiddings}
              openingResults={openingResults}
              followUp={followUpEntries}
              activeCount={activeCount}
              today={today}
            />
          </div>

          <aside className="grid min-w-0 gap-4 lg:row-span-2" aria-label="ウォッチ・開札予定・ニュース">
            <WatchResultsPanel items={allItems} />
            <OpeningSchedule items={upcomingBiddings} />
            <NewsSection pageSize={5} showAllLink compact />
          </aside>

          <div className="grid min-w-0 gap-4">
            <AnnouncementTrend months={months} />
            <AlertNotificationPanel items={allItems} />
            <ProjectListLink items={allItems} />
          </div>
        </div>

        {/* 運用サマリ（詳細は /admin） */}
        <div className="mt-4">
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
                : collectionStopped
                  ? dataFreshness.isStale
                    ? ' / 収集が止まっています'
                    : ` / ${staleMunicipalities.map(s => s.municipality).join('・')}の収集が止まっています`
                  : ` / 要確認 ${auditIssueCount}件`}
            </span>
            <span className="text-xs font-bold tracking-[0.14em] underline-offset-4 hover:underline">運用状況を見る →</span>
          </Link>
        </div>

    </AppShell>
  );
}

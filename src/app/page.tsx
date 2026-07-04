import { BiddingItem } from '@/types/bidding';
import fs from 'fs';
import path from 'path';
import { AppShell } from '@/components/AppShell';
import { Header } from '@/components/Header';
import { BiddingTable } from '@/components/BiddingTable';
import { AlertNotificationPanel } from '@/components/AlertNotificationPanel';
import { MunicipalityCoverageDashboard } from '@/components/MunicipalityCoverageDashboard';
import { MunicipalityStatusOverview } from '@/components/MunicipalityStatusOverview';
import { TargetScopePanel } from '@/components/TargetScopePanel';
import { CriticalWatchPanel } from '@/components/CriticalWatchPanel';
import { PracticalWorkQueue } from '@/components/PracticalWorkQueue';
import { LiveSourceAuditPanel, type LiveSourceAuditReport } from '@/components/LiveSourceAuditPanel';
import { OpeningResultDigest } from '@/components/OpeningResultDigest';
import { ResultFollowUpPanel } from '@/components/ResultFollowUpPanel';
import { NewsSection } from '@/components/NewsSection';
import { NewsTicker } from '@/components/NewsTicker';
import { getShortBiddingLabel } from '@/lib/bidding_schedule';
import { countPracticalFilter } from '@/lib/practical_filters';
import { OPENING_RESULT_UPDATES_PATH, type OpeningResultUpdateReport } from '@/lib/opening_result_updates';
import { Activity, CalendarClock } from 'lucide-react';
import Link from 'next/link';

interface QualitySummary {
  generatedAt?: string;
  source?: string;
  originalCount?: number;
  scrapedCount?: number;
  keptCount?: number;
  removedCount?: number;
  rejectedCount?: number;
  oldestAnnouncementDate?: string | null;
  latestAnnouncementDate?: string | null;
  municipalityCount?: number;
  sourceCoverage?: {
    activeCount: number;
    okCount: number;
    missingErrorCount: number;
    missingWarningCount: number;
    results: Array<{
      expectation: {
        municipality: string;
        requiredLinkIncludes: string[];
      };
      status: 'ok' | 'missing';
      totalCount: number;
      missingLinkIncludes: string[];
      sourceCounts: Record<string, number>;
      message: string;
    }>;
  };
  municipalityAudit?: {
    expectedMunicipalityCount?: number;
    coveredMunicipalityCount?: number;
    missingMunicipalities?: string[];
    zeroCountMunicipalities?: string[];
    retainedFromPrevious?: string[];
    issues?: Array<{
      municipality: string;
      level: 'warning' | 'error';
      message: string;
    }>;
    breakdown?: Array<{
      municipality: string;
      count: number;
      changeFromPrevious?: number;
    }>;
  };
}

function formatDateLabel(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

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
  // Read pre-scraped data from JSON
  const jsonPath = path.join(process.cwd(), 'scraper_result.json');
  const qualityPath = path.join(process.cwd(), 'scraper_quality.json');
  const liveAuditPath = path.join(process.cwd(), 'live_source_audit_report.json');
  const openingResultUpdatesPath = path.join(process.cwd(), OPENING_RESULT_UPDATES_PATH);
  let allItems: BiddingItem[] = [];
  let qualitySummary: QualitySummary | null = null;
  let liveAuditReport: LiveSourceAuditReport | null = null;
  let openingResultReport: OpeningResultUpdateReport | null = null;

  try {
    if (fs.existsSync(jsonPath)) {
      const fileContent = fs.readFileSync(jsonPath, 'utf-8');
      allItems = JSON.parse(fileContent);
    }
    if (fs.existsSync(qualityPath)) {
      const qualityContent = fs.readFileSync(qualityPath, 'utf-8');
      qualitySummary = JSON.parse(qualityContent);
    }
    if (fs.existsSync(liveAuditPath)) {
      const liveAuditContent = fs.readFileSync(liveAuditPath, 'utf-8');
      liveAuditReport = JSON.parse(liveAuditContent);
    }
    if (fs.existsSync(openingResultUpdatesPath)) {
      const openingResultContent = fs.readFileSync(openingResultUpdatesPath, 'utf-8');
      openingResultReport = JSON.parse(openingResultContent);
    }
  } catch {
    // エラー時は空配列を返す
  }

  // Sort by announcement date descending
  allItems.sort((a, b) => new Date(b.announcementDate).getTime() - new Date(a.announcementDate).getTime());

  const today = new Date().toISOString().split('T')[0];

  const oneWeekLater = new Date();
  oneWeekLater.setDate(oneWeekLater.getDate() + 7);
  const urgentCount = allItems.filter(item => {
    if (!item.biddingDate) return false;
    const deadline = new Date(item.biddingDate);
    const now = new Date();
    return deadline > now && deadline <= oneWeekLater;
  }).length;

  const latestAnnouncementDate = qualitySummary?.latestAnnouncementDate || allItems[0]?.announcementDate;
  const hasHealthRecord = Boolean(qualitySummary?.generatedAt);
  const keptCount = qualitySummary?.keptCount ?? allItems.length;
  const latestQualityDate = qualitySummary?.generatedAt ? new Date(qualitySummary.generatedAt).toLocaleDateString('ja-JP') : null;
  const activeCount = countPracticalFilter(allItems, 'active');
  const resultFollowUpCount = countPracticalFilter(allItems, 'resultFollowUp');
  
  const upcomingBiddings = allItems
    .filter(item => item.biddingDate && item.status !== '落札' && item.status !== '受付終了')
    .filter(item => item.biddingDate! >= today)
    .sort((a, b) => (a.biddingDate || '').localeCompare(b.biddingDate || ''))
    .slice(0, 4);

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
                まず受付中、次に直近開札、最後に結果追跡待ちを確認します。市町村別や監査情報は下部に分けました。
              </p>
            </div>
            <div className="grid w-full max-w-xl grid-cols-3 gap-2 rounded-3xl border border-white/10 bg-white/10 p-2 text-center backdrop-blur">
              <Link href="/search?quick=active" className="rounded-2xl bg-white/10 px-3 py-3 transition hover:bg-white/15">
                <p className="text-[9px] tracking-[0.2em] text-stone-300 uppercase">受付中</p>
                <p className="mt-1 text-2xl font-light tabular-nums text-emerald-200">{activeCount}</p>
              </Link>
              <a href="#project-board" className="rounded-2xl bg-white/10 px-3 py-3 transition hover:bg-white/15">
                <p className="text-[9px] tracking-[0.2em] text-stone-300 uppercase">直近開札</p>
                <p className="mt-1 text-2xl font-light tabular-nums text-amber-200">{urgentCount}</p>
              </a>
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

        <div className="mb-8 grid gap-2 md:grid-cols-4">
          <a href="#project-board" className="group rounded-2xl border border-stone-200 bg-white/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-700">Main</p>
            <p className="mt-2 text-base font-semibold tracking-[0.05em] text-primary">案件一覧を見る</p>
            <p className="mt-1 text-xs leading-5 text-secondary/55">受付中の必要案件から確認</p>
          </a>
          <a href="#municipality-status" className="group rounded-2xl border border-stone-200 bg-white/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700">Area</p>
            <p className="mt-2 text-base font-semibold tracking-[0.05em] text-primary">市町村別に見る</p>
            <p className="mt-1 text-xs leading-5 text-secondary/55">件数と状態だけを一覧</p>
          </a>
          <Link href="/search?quick=active" className="group rounded-2xl border border-stone-200 bg-white/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky-700">Search</p>
            <p className="mt-2 text-base font-semibold tracking-[0.05em] text-primary">受付中だけ検索</p>
            <p className="mt-1 text-xs leading-5 text-secondary/55">今日追える案件に絞る</p>
          </Link>
          <Link href="/chat" className="group rounded-2xl border border-stone-200 bg-white/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-300 hover:shadow-md">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-rose-700">Chat</p>
            <p className="mt-2 text-base font-semibold tracking-[0.05em] text-primary">質問して探す</p>
            <p className="mt-1 text-xs leading-5 text-secondary/55">市町村名や案件名で質問</p>
          </Link>
        </div>

        <OpeningResultDigest items={allItems} report={openingResultReport} />

        <ResultFollowUpPanel items={allItems} />

        {/* Main Project Board */}
        <BiddingTable items={allItems} />

        {/* News Section */}
        <NewsSection />

        <section className="mt-16 space-y-8" aria-label="運用状況">
          <div className="rounded-[2rem] border border-stone-200/80 bg-white/70 p-6 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-secondary/45">Operations</p>
                <h3 className="mt-3 text-2xl font-light tracking-[0.08em] text-primary">収集状況・市町村カバレッジ</h3>
                <p className="mt-3 max-w-3xl text-sm leading-7 tracking-[0.04em] text-secondary/65">
                  どの自治体が見られているか、公開サイト監査が通っているかはここにまとめました。
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 rounded-2xl border border-stone-200 bg-stone-50 p-2 text-center">
                <div className="rounded-xl bg-white px-3 py-2">
                  <p className="text-[9px] tracking-[0.18em] text-secondary/40 uppercase">掲載</p>
                  <p className="mt-1 text-lg tabular-nums text-primary">{keptCount}</p>
                </div>
                <div className="rounded-xl bg-white px-3 py-2">
                  <p className="text-[9px] tracking-[0.18em] text-secondary/40 uppercase">最新公告</p>
                  <p className="mt-1 text-sm text-primary">{formatDateLabel(latestAnnouncementDate)}</p>
                </div>
                <div className="rounded-xl bg-white px-3 py-2">
                  <p className="text-[9px] tracking-[0.18em] text-secondary/40 uppercase">更新</p>
                  <p className="mt-1 flex items-center justify-center gap-1 text-sm text-primary">
                    <Activity size={13} className={hasHealthRecord ? 'text-green-600' : 'text-amber-600'} />
                    {latestQualityDate || '-'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <AlertNotificationPanel items={allItems} />

          <MunicipalityStatusOverview items={allItems} quality={qualitySummary} />

          <PracticalWorkQueue items={allItems} />

          <CriticalWatchPanel items={allItems} />

          <TargetScopePanel items={allItems} />

          <LiveSourceAuditPanel report={liveAuditReport} />

          <MunicipalityCoverageDashboard items={allItems} quality={qualitySummary} />
        </section>

    </AppShell>
  );
}

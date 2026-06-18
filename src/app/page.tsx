import { BiddingItem } from '@/types/bidding';
import fs from 'fs';
import path from 'path';
import { AppShell } from '@/components/AppShell';
import { Header } from '@/components/Header';
import { StatsCard } from '@/components/StatsCard';
import { BiddingTable } from '@/components/BiddingTable';
import { AlertNotificationPanel } from '@/components/AlertNotificationPanel';
import { MunicipalityCoverageDashboard } from '@/components/MunicipalityCoverageDashboard';
import { TargetScopePanel } from '@/components/TargetScopePanel';
import { CriticalWatchPanel } from '@/components/CriticalWatchPanel';
import { PracticalWorkQueue } from '@/components/PracticalWorkQueue';
import { LiveSourceAuditPanel, type LiveSourceAuditReport } from '@/components/LiveSourceAuditPanel';
import { NewsSection } from '@/components/NewsSection';
import { NewsTicker } from '@/components/NewsTicker';
import { getShortBiddingLabel } from '@/lib/bidding_schedule';
import { Activity, ArrowRight, CalendarClock, CheckCircle2, MessageSquareText } from 'lucide-react';
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
  let allItems: BiddingItem[] = [];
  let qualitySummary: QualitySummary | null = null;
  let liveAuditReport: LiveSourceAuditReport | null = null;

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
  } catch {
    // エラー時は空配列を返す
  }

  // Sort by announcement date descending
  allItems.sort((a, b) => new Date(b.announcementDate).getTime() - new Date(a.announcementDate).getTime());

  // Calculate Metrics from real data
  const today = new Date().toISOString().split('T')[0];
  const newArrivals = allItems.filter(item => item.announcementDate === today).length;

  // Urgent: Deadline within 7 days
  const oneWeekLater = new Date();
  oneWeekLater.setDate(oneWeekLater.getDate() + 7);
  const urgentCount = allItems.filter(item => {
    if (!item.biddingDate) return false;
    const deadline = new Date(item.biddingDate);
    const now = new Date();
    return deadline > now && deadline <= oneWeekLater;
  }).length;

  const latestAnnouncementDate = qualitySummary?.latestAnnouncementDate || allItems[0]?.announcementDate;
  const removedCount = qualitySummary?.removedCount ?? qualitySummary?.rejectedCount ?? 0;
  const hasHealthRecord = Boolean(qualitySummary?.generatedAt);
  const keptCount = qualitySummary?.keptCount ?? allItems.length;
  const rawCount = qualitySummary?.originalCount ?? qualitySummary?.scrapedCount ?? keptCount + removedCount;
  const latestQualityDate = qualitySummary?.generatedAt ? new Date(qualitySummary.generatedAt).toLocaleDateString('ja-JP') : null;
  
  const upcomingBiddings = allItems
    .filter(item => item.biddingDate && item.status !== '落札' && item.status !== '受付終了')
    .filter(item => item.biddingDate! >= today)
    .sort((a, b) => (a.biddingDate || '').localeCompare(b.biddingDate || ''))
    .slice(0, 4);

  return (
    <AppShell>
        <NewsTicker />
        <Header />
        
        {/* Real-time Alert Notification Panel for Subcontractors */}
        <AlertNotificationPanel items={allItems} />

        <div className="mb-8 rounded-[2rem] border border-rose-200/70 bg-gradient-to-br from-rose-50 via-white to-amber-50 p-6 shadow-soft lg:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white/80 px-3 py-1 text-[10px] font-bold tracking-[0.24em] text-rose-600 uppercase">
                <CalendarClock size={14} />
                直近開札
              </div>
              <h3 className="mt-4 text-3xl font-light tracking-[0.08em] text-primary">まず見るべき案件</h3>
              <p className="mt-3 text-sm leading-7 tracking-[0.05em] text-secondary/75">
                この画面で最初に見るべきなのは開札が近い案件です。下の一覧までスクロールしなくても、
                直近の予定をここでまとめて確認できるようにしました。
              </p>
            </div>
            <div className="shrink-0 rounded-2xl border border-white/80 bg-white/70 px-4 py-3 shadow-sm">
              <p className="text-[10px] tracking-[0.2em] text-secondary/45 uppercase">表示中</p>
              <p className="mt-1 text-2xl font-light tracking-tight text-primary">{upcomingBiddings.length}<span className="ml-1 text-sm text-accent">件</span></p>
              <p className="mt-1 text-xs tracking-[0.08em] text-secondary/55">直近の開札予定</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-4 md:grid-cols-2">
            {upcomingBiddings.map((item) => (
              <a
                key={item.id}
                href={`/project/${item.id}`}
                className="group rounded-[1.6rem] border border-rose-200/60 bg-white/90 p-5 shadow-sm transition hover:-translate-y-1 hover:border-rose-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-bold tracking-[0.18em] text-rose-700 uppercase">
                    {getDaysUntilLabel(item.biddingDate)}
                  </span>
                  <span className="text-[10px] tracking-[0.18em] text-secondary/50 uppercase">{item.municipality}</span>
                </div>
                <h4 className="mt-4 line-clamp-3 text-[15px] leading-7 tracking-[0.03em] text-primary transition group-hover:text-rose-700">
                  {item.title}
                </h4>
                <div className="mt-5 space-y-2 rounded-2xl bg-sidebar/55 p-3">
                  <div className="flex items-center justify-between text-[10px] tracking-wider text-secondary/40 font-mono">
                    <span>{getShortBiddingLabel(item)}</span>
                    <span className="font-bold text-secondary/60">{item.biddingDate}</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* Stats Panel */}
        <div className="mb-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <StatsCard title="新着案件" value={newArrivals} unit="件" icon="inbound" color="blue" description="本日公告された奈良県内の新着入札情報" />
          <StatsCard title="直近開札" value={urgentCount} unit="件" icon="calendar" color="rose" description="今後1週間以内に開札予定の案件" />
          <StatsCard title="登録商材マッチ" value={allItems.filter(item => item.announcementDate === today).length} unit="件" icon="alert" color="amber" description="登録商材に関連する本日の新着案件" />
        </div>

        {/* Health Check Bar */}
        <div className="mb-12 rounded-3xl border border-white/60 bg-white/30 p-6 shadow-sm backdrop-blur-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-gray-900 tracking-wide">データ収集エンジン稼働中</h4>
                <p className="mt-1 text-xs text-gray-500 tracking-wider">奈良県内の掲載案件を横断した収集状況を表示しています</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:min-w-[520px]">
              <div>
                <p className="text-[9px] tracking-[0.2em] text-secondary/40 uppercase">取得候補</p>
                <p className="mt-1 text-lg tabular-nums tracking-wider text-primary">{rawCount}<span className="ml-1 text-[10px] text-accent">件</span></p>
              </div>
              <div>
                <p className="text-[9px] tracking-[0.2em] text-secondary/40 uppercase">掲載</p>
                <p className="mt-1 text-lg tabular-nums tracking-wider text-primary">{keptCount}<span className="ml-1 text-[10px] text-accent">件</span></p>
              </div>
              <div>
                <p className="text-[9px] tracking-[0.2em] text-secondary/40 uppercase">最新公告日</p>
                <p className="mt-1 text-sm tracking-wider text-primary">{formatDateLabel(latestAnnouncementDate)}</p>
              </div>
              <div>
                <p className="text-[9px] tracking-[0.2em] text-secondary/40 uppercase">更新記録</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm tracking-wider text-primary">
                  <Activity size={14} className={hasHealthRecord ? 'text-green-600' : 'text-amber-600'} />
                  {hasHealthRecord ? (latestQualityDate || '記録あり') : '未記録'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <TargetScopePanel items={allItems} />

        <CriticalWatchPanel items={allItems} />

        <LiveSourceAuditPanel report={liveAuditReport} />

        <PracticalWorkQueue items={allItems} />

        <MunicipalityCoverageDashboard items={allItems} quality={qualitySummary} />

        {/* Quick Access */}
        <div className="mb-14">
          <Link href="/chat" className="group block rounded-[2rem] border border-emerald-900/10 bg-white p-8 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <MessageSquareText size={26} />
                </div>
                <div className="max-w-3xl">
                  <p className="text-[10px] font-bold tracking-[0.24em] text-emerald-600 uppercase">Quick Access</p>
                  <h3 className="mt-2 text-2xl font-bold text-gray-900">入札チャット</h3>
                  <p className="mt-3 text-sm leading-7 text-gray-500">
                    今週の開札、自治体別の新着、特定案件の深掘りまで自然言語で質問できます。必要なときは Web 補足も使えます。
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 self-end lg:self-auto">
                <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[10px] font-bold tracking-[0.18em] text-emerald-700 uppercase">
                  AI Assistant
                </span>
                <ArrowRight className="text-gray-300 transition-all group-hover:translate-x-1 group-hover:text-emerald-600" />
              </div>
            </div>
          </Link>
        </div>

        {/* Main Table */}
        <BiddingTable items={allItems} />

        {/* News Section */}
        <NewsSection />

    </AppShell>
  );
}

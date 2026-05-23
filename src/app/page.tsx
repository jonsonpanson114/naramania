import { BiddingItem } from '@/types/bidding';
import fs from 'fs';
import path from 'path';
import { AppShell } from '@/components/AppShell';
import { Header } from '@/components/Header';
import { StatsCard } from '@/components/StatsCard';
import { BiddingTable } from '@/components/BiddingTable';
import { NewsSection } from '@/components/NewsSection';
import { NewsTicker } from '@/components/NewsTicker';
import { getShortBiddingLabel } from '@/lib/bidding_schedule';
import { Activity, AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, MessageSquareText } from 'lucide-react';
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
}

function formatDateLabel(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

function formatDateTimeLabel(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  let allItems: BiddingItem[] = [];
  let qualitySummary: QualitySummary | null = null;

  try {
    if (fs.existsSync(jsonPath)) {
      const fileContent = fs.readFileSync(jsonPath, 'utf-8');
      allItems = JSON.parse(fileContent);
    }
    if (fs.existsSync(qualityPath)) {
      const qualityContent = fs.readFileSync(qualityPath, 'utf-8');
      qualitySummary = JSON.parse(qualityContent);
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
  void allItems.filter(item => {
    if (!item.biddingDate) return false;
    const deadline = new Date(item.biddingDate);
    const now = new Date();
    return deadline > now && deadline <= oneWeekLater;
  }).length;

  // Intelligence stats
  void allItems.filter(item => item.status === '落札').length;
  void allItems.filter(item => item.status === '落札' && item.winnerType === 'ゼネコン').length;
  void allItems.filter(item => item.status === '落札' && item.winnerType === '設計事務所').length;

  const latestAnnouncementDate = qualitySummary?.latestAnnouncementDate || allItems[0]?.announcementDate;
  const municipalityCount = qualitySummary?.municipalityCount ?? new Set(allItems.map(item => item.municipality)).size;
  const removedCount = qualitySummary?.removedCount ?? qualitySummary?.rejectedCount ?? 0;
  const generatedAt = qualitySummary?.generatedAt;
  const generatedDate = generatedAt ? new Date(generatedAt) : null;
  const hasHealthRecord = Boolean(generatedDate && !Number.isNaN(generatedDate.getTime()));
  const healthStatusLabel = hasHealthRecord ? '記録あり' : '要確認';
  const qualitySource = qualitySummary?.source === 'daily_scrape' ? '自動更新' : '手動確認';
  const keptCount = qualitySummary?.keptCount ?? allItems.length;
  const rawCount = qualitySummary?.originalCount ?? qualitySummary?.scrapedCount ?? keptCount + removedCount;
  const upcomingBiddings = allItems
    .filter(item => item.biddingDate && item.status !== '落札' && item.status !== '受付終了')
    .filter(item => item.biddingDate! >= today)
    .sort((a, b) => (a.biddingDate || '').localeCompare(b.biddingDate || ''))
    .slice(0, 4);

  return (
    <AppShell>
        <NewsTicker />
        <Header />

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
                  <div className="flex items-center justify-between text-[11px] tracking-[0.08em] text-secondary/70">
                    <span>公告</span>
                    <span className="font-bold text-primary">{formatDateLabel(item.announcementDate)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] tracking-[0.08em] text-secondary/70">
                    <span>{getShortBiddingLabel(item)}</span>
                    <span className="font-bold text-rose-700">{formatDateLabel(item.biddingDate)}</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          <StatsCard label="全案件数" value={allItems.length} unit="件" subtext="建築・建物系に整理済み" delay={0.1} />
          <StatsCard label="本日更新" value={newArrivals} unit="件" subtext="新着案件" delay={0.2} />
          <StatsCard label="最新公告" value={formatDateLabel(latestAnnouncementDate)} unit="" subtext="データ内の最新日" delay={0.3} />
          <StatsCard label="除外済み" value={removedCount} unit="件" subtext={`${municipalityCount}自治体を掲載`} delay={0.4} />
        </div>

        {/* Data Health */}
        <div className="mb-12 rounded-lg border border-border/50 bg-white/70 p-6 shadow-soft">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className={`mt-1 flex h-10 w-10 items-center justify-center rounded-md border ${hasHealthRecord ? 'border-green-100 bg-green-50 text-green-600' : 'border-amber-100 bg-amber-50 text-amber-600'}`}>
                {hasHealthRecord ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-sm font-bold tracking-[0.2em] text-primary uppercase">Data Health</h3>
                  <span className={`rounded-sm border px-2 py-0.5 text-[9px] font-bold tracking-[0.2em] ${hasHealthRecord ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                    {healthStatusLabel}
                  </span>
                </div>
                <p className="mt-2 text-xs tracking-wider text-secondary/60">
                  最終更新: {formatDateTimeLabel(generatedAt)} / 更新元: {qualitySource}
                </p>
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
                <p className="text-[9px] tracking-[0.2em] text-secondary/40 uppercase">対象期間</p>
                <p className="mt-1 text-sm tracking-wider text-primary">{formatDateLabel(qualitySummary?.oldestAnnouncementDate)} - {formatDateLabel(latestAnnouncementDate)}</p>
              </div>
              <div>
                <p className="text-[9px] tracking-[0.2em] text-secondary/40 uppercase">状態</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm tracking-wider text-primary">
                  <Activity size={14} className={hasHealthRecord ? 'text-green-600' : 'text-amber-600'} />
                  {hasHealthRecord ? '品質記録あり' : '未記録'}
                </p>
              </div>
            </div>
          </div>
        </div>
 
        {/* Municipality Distribution */}
        <div className="mb-12">
          <h3 className="text-sm font-bold text-secondary mb-4 tracking-[0.2em] font-serif uppercase flex items-center gap-2">
            <span className="w-4 h-px bg-secondary opacity-30"></span> Coverage Status
          </h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(allItems.reduce((acc, item) => {
              acc[item.municipality] = (acc[item.municipality] || 0) + 1;
              return acc;
            }, {} as Record<string, number>))
              .sort((a, b) => b[1] - a[1])
              .map(([m, count]) => (
                <div key={m} className="bg-white/50 backdrop-blur-sm border border-border/40 px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-sm hover:shadow-md transition-all group">
                  <span className="text-[11px] font-serif font-bold text-primary group-hover:text-accent transition-colors">{m}</span>
                  <span className="text-[9px] bg-secondary/10 text-secondary px-1.5 py-0.5 rounded-md font-sans font-bold">{count}</span>
                </div>
              ))}
          </div>
        </div>

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
                    今週の開札、自治体別の新着、特定案件の深掘りまで自然文で質問できます。必要なときは Web 補足も使います。
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

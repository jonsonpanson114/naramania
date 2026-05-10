import { BiddingItem } from '@/types/bidding';
import fs from 'fs';
import path from 'path';
import { AppShell } from '@/components/AppShell';
import { Header } from '@/components/Header';
import { StatsCard } from '@/components/StatsCard';
import { BiddingTable } from '@/components/BiddingTable';
import { NewsSection } from '@/components/NewsSection';
import { NewsTicker } from '@/components/NewsTicker';
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Radar, Trophy } from 'lucide-react';
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

  return (
    <AppShell>
        <NewsTicker />
        <Header />

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
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

        {/* Quick Insights Navigation */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-20">
          <Link href="/rankings" className="group bg-white p-8 rounded-3xl border border-amber-900/10 shadow-sm hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
                <Trophy size={24} />
              </div>
              <ArrowRight className="text-gray-300 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">落札実績ランキング</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              どの業者が最も多く受注しているか、設計事務所はどこか。AIが解析したデータを集計し、上位10社をランキング形式で表示します。
            </p>
          </Link>

          <Link href="/radar" className="group bg-white p-8 rounded-3xl border border-indigo-900/10 shadow-sm hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                <Radar size={24} />
              </div>
              <ArrowRight className="text-gray-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">価格相場レーダー</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              案件ごとの設計金額・落札価格の分布を可視化。自治体ごとの相場感や、工事規模による傾向を視覚的に把握できます。
            </p>
          </Link>
        </div>

        {/* Main Table */}
        <BiddingTable items={allItems} />

        {/* News Section */}
        <NewsSection />

    </AppShell>
  );
}

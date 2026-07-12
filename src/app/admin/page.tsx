import { AppShell } from '@/components/AppShell';
import { MunicipalityCoverageDashboard } from '@/components/MunicipalityCoverageDashboard';
import { MunicipalityStatusOverview } from '@/components/MunicipalityStatusOverview';
import { CriticalWatchPanel } from '@/components/CriticalWatchPanel';
import { PracticalWorkQueue } from '@/components/PracticalWorkQueue';
import { LiveSourceAuditPanel } from '@/components/LiveSourceAuditPanel';
import { TargetScopePanel } from '@/components/TargetScopePanel';
import { loadDashboardData } from '@/lib/dashboard_data';
import { Activity, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

function formatDateLabel(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

export default async function AdminPage() {
  const { allItems, qualitySummary, liveAuditReport } = loadDashboardData();

  const latestAnnouncementDate = qualitySummary?.latestAnnouncementDate || allItems[0]?.announcementDate;
  const hasHealthRecord = Boolean(qualitySummary?.generatedAt);
  const keptCount = qualitySummary?.keptCount ?? allItems.length;
  const latestQualityDate = qualitySummary?.generatedAt
    ? new Date(qualitySummary.generatedAt).toLocaleDateString('ja-JP')
    : null;

  return (
    <AppShell>
      <div className="mb-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs tracking-[0.14em] text-secondary/60 transition hover:text-primary"
        >
          <ArrowLeft size={14} />
          ダッシュボードに戻る
        </Link>
        <h2 className="mt-4 text-3xl font-light tracking-[0.08em] text-primary font-serif">運用状況</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 tracking-[0.04em] text-secondary/65">
          スクレイパーの収集状況、市町村カバレッジ、公開サイト監査の結果をまとめたページです。日常の案件確認では見る必要はありません。
        </p>
      </div>

      <section className="space-y-8" aria-label="運用状況">
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

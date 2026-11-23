import { AppShell } from '@/components/AppShell';
import { ExternalLink } from 'lucide-react';
import { MUNICIPALITY_SOURCES } from '@/lib/municipality_sources';
import { loadDashboardData } from '@/lib/dashboard_data';
import { getStaleMunicipalities } from '@/lib/data_freshness';
import { loadNewsStore } from '@/lib/news_store';
import { loadOsakaAwardsView } from '@/lib/osaka_awards_store';

function formatDateTime(iso?: string): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function SourcesPage() {
    const { allItems, qualitySummary } = loadDashboardData();
    const newsStore = loadNewsStore();
    const osakaView = loadOsakaAwardsView();
    const lastScraped = qualitySummary?.municipalityLastScraped;
    // 「古い」と「記録が無くて状態不明」は原因も対処も違うので分けて出す。
    const freshnessIssues = getStaleMunicipalities(lastScraped);
    const staleSet = new Set(freshnessIssues.filter(s => s.status === 'stale').map(s => s.municipality));
    const unknownSet = new Set(freshnessIssues.filter(s => s.status === 'unknown').map(s => s.municipality));

    const counts = allItems.reduce<Record<string, number>>((acc, item) => {
        acc[item.municipality] = (acc[item.municipality] || 0) + 1;
        return acc;
    }, {});

    return (
        <AppShell>
            <div className="mb-8">
                <h1 className="paper-title">入札情報の収集元</h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 tracking-wider text-secondary/60">
                    各自治体の入札情報ページへのリンクです。ここに載せているのは実際にこのサイトが
                    見に行っているページなので、原本を自分で確認したいときにも、正しいページを
                    見ているかを確かめたいときにも使えます。
                </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {MUNICIPALITY_SOURCES.map(group => {
                    const count = counts[group.municipality] ?? 0;
                    const updated = formatDateTime(lastScraped?.[group.municipality]);
                    const isStale = staleSet.has(group.municipality);
                    const isUnknown = unknownSet.has(group.municipality);

                    return (
                        <section
                            key={group.municipality}
                            className={`rounded-2xl border bg-white/80 p-4 shadow-sm transition hover:shadow-md ${
                                isStale || isUnknown ? 'border-amber-300 bg-amber-50/60' : 'border-stone-200'
                            }`}
                        >
                            <div className="flex items-baseline justify-between gap-2">
                                <h3 className="text-base font-bold tracking-[0.06em] text-primary">
                                    {group.municipality}
                                </h3>
                                <span className="shrink-0 text-[12px] tabular-nums text-secondary/60">
                                    掲載 {count}件
                                </span>
                            </div>

                            <p className="mt-1 text-[11px] tracking-wider text-secondary/50">
                                {updated
                                    ? <>最終収集 {updated}{isStale && <span className="ml-1 font-bold text-amber-700">収集が止まっています</span>}</>
                                    : <>最終収集 記録なし<span className="ml-1 font-bold text-amber-700">収集できているか不明です</span></>}
                            </p>

                            <ul className="mt-3 space-y-1.5">
                                {group.sources.map(source => (
                                    <li key={source.url}>
                                        <a
                                            href={source.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="group flex items-start gap-1.5 text-[13px] leading-6 text-primary transition-colors hover:text-accent"
                                        >
                                            <ExternalLink size={13} className="mt-1 shrink-0 text-gray-400 transition-colors group-hover:text-accent" />
                                            <span>
                                                {source.label}
                                                {source.external && (
                                                    <span className="ml-1.5 rounded-sm bg-stone-100 px-1.5 py-0.5 text-[10px] tracking-wider text-stone-500">
                                                        外部システム
                                                    </span>
                                                )}
                                                {source.note && (
                                                    <span className="block text-[11px] text-secondary/50">{source.note}</span>
                                                )}
                                            </span>
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    );
                })}
            </div>

            {/* 大阪エリア（大阪府・大阪市・堺市）の入札結果チェック */}
            <section className="mt-12">
                <h2 className="text-xl tracking-widest font-serif">大阪エリアの入札結果チェック（奈良の設計事務所）</h2>
                <p className="mt-2 text-sm tracking-wider text-secondary/60">
                    大阪府・大阪市・堺市の設計系入札結果を定期的に確認し、奈良の設計事務所が落札した案件を自動抽出しています。
                    最終巡回 {formatDateTime(osakaView.generatedAt ?? undefined) ?? '記録なし'}、
                    確認済み {osakaView.records.length}件 ／ 奈良の事務所ヒット {osakaView.naraAwards.length}件
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {osakaView.summaries.map(summary => {
                        const checked = formatDateTime(summary.lastCheckedAt ?? undefined);
                        return (
                            <section
                                key={summary.source}
                                className="rounded-2xl border border-stone-200 bg-white/80 p-4 shadow-sm transition hover:shadow-md"
                            >
                                <div className="flex items-baseline justify-between gap-2">
                                    <h3 className="text-base font-bold tracking-[0.06em] text-primary">
                                        {summary.source}
                                    </h3>
                                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                                        summary.naraHitCount > 0
                                            ? 'bg-sky-100 text-sky-800'
                                            : 'bg-stone-100 text-stone-600'
                                    }`}>
                                        奈良ヒット {summary.naraHitCount}件
                                    </span>
                                </div>
                                <p className="mt-1 text-[11px] tracking-wider text-secondary/60 tabular-nums">
                                    最終確認 {checked ?? '記録なし'} ／ 確認 {summary.checkedCount}件（決定 {summary.decidedCount}件）
                                </p>
                                <p className="mt-2 text-[12px] leading-5 text-secondary/70">
                                    {summary.note}
                                </p>
                                <a
                                    href={summary.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-primary hover:text-accent hover:underline"
                                >
                                    <ExternalLink size={12} className="shrink-0 text-gray-400" />
                                    {summary.label}
                                </a>
                            </section>
                        );
                    })}
                </div>
            </section>

            {/* 取れなくなった媒体に気づけるよう、前回の巡回結果を出す */}
            <section className="mt-12">
                <h2 className="text-xl tracking-widest font-serif">ニュースの収集元</h2>
                <p className="mt-2 text-sm tracking-wider text-secondary/60">
                    1日3回自動で巡回しています。最終巡回 {formatDateTime(newsStore.generatedAt ?? undefined) ?? '記録なし'}、保存 {newsStore.items.length}件
                </p>
                <ul className="mt-4 divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white/80">
                    {newsStore.sources.map(source => (
                        <li key={source.id} className="flex items-center justify-between gap-4 px-4 py-3 text-[13px]">
                            <span className="font-bold text-primary">{source.label}</span>
                            <span className={source.error ? 'font-bold text-amber-700' : 'text-secondary/60'}>
                                {source.error
                                    ? `取得に失敗しています`
                                    : `最新${source.fetched}件を確認 / 奈良の記事 ${source.kept}件`}
                            </span>
                        </li>
                    ))}
                </ul>
            </section>
        </AppShell>
    );
}

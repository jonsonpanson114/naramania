import { AppShell } from '@/components/AppShell';
import { Header } from '@/components/Header';
import { ExternalLink } from 'lucide-react';
import { MUNICIPALITY_SOURCES } from '@/lib/municipality_sources';
import { loadDashboardData } from '@/lib/dashboard_data';
import { getStaleMunicipalities } from '@/lib/data_freshness';

function formatDateTime(iso?: string): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function SourcesPage() {
    const { allItems, qualitySummary } = loadDashboardData();
    const lastScraped = qualitySummary?.municipalityLastScraped;
    const staleSet = new Set(getStaleMunicipalities(lastScraped).map(s => s.municipality));

    const counts = allItems.reduce<Record<string, number>>((acc, item) => {
        acc[item.municipality] = (acc[item.municipality] || 0) + 1;
        return acc;
    }, {});

    return (
        <AppShell>
            <Header />
            <div className="mb-8">
                <h2 className="text-3xl tracking-widest font-serif">入札情報の収集元</h2>
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

                    return (
                        <section
                            key={group.municipality}
                            className={`rounded-2xl border bg-white/80 p-4 shadow-sm transition hover:shadow-md ${
                                isStale ? 'border-amber-300 bg-amber-50/60' : 'border-stone-200'
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
                                    : '最終収集 記録なし'}
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
        </AppShell>
    );
}

import Link from 'next/link';
import { ArrowRight, ExternalLink } from 'lucide-react';
import type { OsakaAwardRecord, OsakaSourceSummary } from '@/lib/osaka_awards_store';

function formatDate(dateStr?: string): string {
    if (!dateStr) return '-';
    const m = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return dateStr;
    return `${Number(m[2])}/${Number(m[3])}`;
}

function isWithinDays(dateStr: string, todayIso: string, days: number): boolean {
    if (!dateStr) return false;
    const target = new Date(`${dateStr}T00:00:00+09:00`).getTime();
    const base = new Date(`${todayIso}T00:00:00+09:00`).getTime();
    if (Number.isNaN(target) || Number.isNaN(base)) return false;
    const diffDays = (base - target) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= days;
}

export function OsakaAwardsHomePanel({
    naraAwards,
    summaries,
    totalRecords,
    today,
}: {
    naraAwards: OsakaAwardRecord[];
    summaries: OsakaSourceSummary[];
    totalRecords: number;
    today: string;
}) {
    const recentHits = naraAwards.filter(item => isWithinDays(item.openDate, today, 14)).slice(0, 2);

    return (
        <section className="paper-panel p-2.5" aria-labelledby="osaka-awards-heading">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <h2 id="osaka-awards-heading" className="text-xs font-bold tracking-wider text-secondary">
                    参考：大阪エリア（府・市・堺）
                </h2>
                <Link href="/news?tab=osaka" className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline">
                    一覧 <ArrowRight size={12} aria-hidden />
                </Link>
            </div>

            <p className="mt-1.5 px-1 text-xs leading-5 text-secondary tabular-nums">
                奈良の事務所ヒット <strong className="text-primary">{naraAwards.length}件</strong>
                （{summaries.map(s => `${s.source} ${s.naraHitCount}`).join(' / ')}）
                <span className="ml-1 text-[11px] text-secondary/70">· 確認 {totalRecords}件</span>
            </p>

            {recentHits.length > 0 && (
                <ul className="mt-2 divide-y divide-border border-t border-border pt-1">
                    {recentHits.map(item => (
                        <li key={item.key} className="px-1 py-1.5">
                            <div className="flex items-center gap-1.5 text-[11px]">
                                <span className="rounded bg-sky-100 px-1.5 py-0.5 font-bold text-sky-900">新着 · {item.source}</span>
                                <span className="text-secondary tabular-nums">{formatDate(item.openDate)}</span>
                            </div>
                            <a
                                href={item.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-0.5 inline-flex items-start gap-1 text-xs font-semibold leading-5 text-primary hover:text-accent hover:underline"
                            >
                                <span>{item.title}</span>
                                <ExternalLink size={11} className="mt-1 shrink-0 text-stone-400" />
                            </a>
                            <p className="text-[11px] font-bold text-sky-800">
                                {item.matchedFirms.join('、') || item.winner}
                            </p>
                        </li>
                    ))}
                </ul>
            )}

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-1 pt-1.5 text-[11px]">
                <Link href="/news?tab=osaka&scope=all" className="font-semibold text-secondary hover:text-accent hover:underline">
                    大阪の全設計結果を見る →
                </Link>
                <Link href="/sources" className="text-secondary/70 hover:text-accent hover:underline">
                    収集状況
                </Link>
            </div>
        </section>
    );
}

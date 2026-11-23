'use client';

import Link from 'next/link';
import { ArrowRight, ExternalLink, Pin } from 'lucide-react';
import type { FirmProfile } from '@/lib/firms_directory';
import { usePinnedFirms } from '@/lib/pinned_firms';
import { estimateDesignTiming, evaluateSalesFit } from '@/lib/sales_fit';

function formatDate(dateStr?: string): string {
    if (!dateStr) return '-';
    const m = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return dateStr;
    return `${Number(m[2])}/${Number(m[3])}`;
}

export function PinnedFirmsHomePanel({ firms }: { firms: FirmProfile[] }) {
    const { pinnedKeys } = usePinnedFirms();
    const pinnedSet = new Set(pinnedKeys);
    const pinnedFirms = firms.filter(f => pinnedSet.has(f.key));

    const recentEntries = pinnedFirms
        .flatMap(firm => firm.entries.slice(0, 3).map(entry => ({ firmName: firm.name, firmKey: firm.key, entry })))
        .sort((a, b) => (b.entry.date || '').localeCompare(a.entry.date || ''))
        .slice(0, 6);

    if (pinnedFirms.length === 0) {
        return (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 bg-white/70 px-3.5 py-2 text-xs text-secondary">
                <span className="flex items-center gap-1.5">
                    <Pin size={13} className="text-amber-700" aria-hidden />
                    よく行く設計事務所をピン留めすると、ここに最新動向が優先表示されます。
                </span>
                <Link href="/firms" className="inline-flex items-center gap-1 font-bold text-accent hover:underline">
                    設計事務所を選ぶ <ArrowRight size={12} aria-hidden />
                </Link>
            </div>
        );
    }

    return (
        <section className="paper-panel p-3" aria-labelledby="pinned-firms-heading">
            <div className="paper-heading flex flex-wrap items-center justify-between gap-2">
                <h2 id="pinned-firms-heading" className="flex items-center gap-1.5">
                    <Pin size={15} className="text-amber-700" aria-hidden />
                    よく行く設計事務所の動き
                </h2>
                <Link href="/firms" className="inline-flex items-center gap-1 font-sans text-xs font-bold text-accent hover:underline">
                    設計事務所一覧 <ArrowRight size={13} aria-hidden />
                </Link>
            </div>

            <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap gap-1.5 px-1">
                        {pinnedFirms.map(firm => (
                            <Link
                                key={firm.key}
                                href={`/firms?firm=${encodeURIComponent(firm.key)}`}
                                className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-950 hover:bg-amber-100"
                            >
                                {firm.name}（奈良{firm.naraCount}{firm.osakaCount > 0 ? ` / 大阪${firm.osakaCount}` : ''}）
                            </Link>
                        ))}
                    </div>

                    <ul className="divide-y divide-border">
                        {recentEntries.map(({ firmName, entry }) => {
                            const fit = evaluateSalesFit(entry.title);
                            const timing = estimateDesignTiming(entry.title, entry.date, entry.type);
                            return (
                                <li key={`${firmName}-${entry.id}`} className="px-2 py-2 odd:bg-paper-stripe">
                                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                        <span className="font-semibold text-secondary tabular-nums">{formatDate(entry.date)}</span>
                                        <span className="font-bold text-primary">{firmName}</span>
                                        <span className={`rounded px-1.5 py-0.5 font-bold ${
                                            entry.area === '大阪' ? 'bg-sky-100 text-sky-900' : 'bg-stone-100 text-stone-700'
                                        }`}>
                                            {entry.source}
                                        </span>
                                        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${fit.badgeClass}`}>
                                            {fit.shortLabel}
                                        </span>
                                    </div>
                                    <div className="mt-1">
                                        {entry.external ? (
                                            <a
                                                href={entry.href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-start gap-1 text-sm font-semibold leading-5 text-primary hover:text-accent hover:underline"
                                            >
                                                <span>{entry.title}</span>
                                                <ExternalLink size={12} className="mt-1 shrink-0 text-stone-400" />
                                            </a>
                                        ) : (
                                            <Link href={entry.href} className="text-sm font-semibold leading-5 text-primary hover:text-accent hover:underline">
                                                {entry.title}
                                            </Link>
                                        )}
                                    </div>
                                    {timing && (
                                        <p className={`mt-0.5 text-[11px] font-semibold ${timing.isNowHot ? 'text-amber-800' : 'text-secondary'}`}>
                                            {timing.isNowHot ? '今が提案どき · ' : ''}仕様提案目安：{timing.proposalWindow}
                                        </p>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
        </section>
    );
}

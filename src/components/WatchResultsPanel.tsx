'use client';

import { useEffect, useState } from 'react';
import { BiddingItem } from '@/types/bidding';
import { ArrowRight, Bell, CheckCircle2, X } from 'lucide-react';
import Link from 'next/link';
import { WATCH_CHANGE_EVENT, getWatchedIds, removeWatch } from '@/lib/watchlist';
import { MunicipalityBadge } from '@/components/ProjectLabels';
import { displayStatus } from '@/lib/status_label';

function formatDate(dateStr?: string): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' });
}

export function WatchResultsPanel({ items }: { items: BiddingItem[] }) {
    const [watchedIds, setWatchedIds] = useState<string[]>([]);

    useEffect(() => {
        const timer = window.setTimeout(() => setWatchedIds(getWatchedIds()), 0);
        const sync = () => setWatchedIds(getWatchedIds());
        window.addEventListener(WATCH_CHANGE_EVENT, sync);
        return () => {
            window.clearTimeout(timer);
            window.removeEventListener(WATCH_CHANGE_EVENT, sync);
        };
    }, []);

    const watchedItems = items.filter(item => watchedIds.includes(item.id));
    const resolved = watchedItems.filter(item => item.status === '落札' || item.status === '不調');
    const waitingItems = watchedItems.filter(item => item.status !== '落札' && item.status !== '不調');
    const waiting = waitingItems.length;

    return (
        <section className="paper-panel home-watch" aria-labelledby="watch-results-heading">
            <div className="home-section-heading">
                <h2 id="watch-results-heading"><Bell size={17} aria-hidden /> あなたのウォッチ</h2>
                {watchedItems.length > 0 && <span>{watchedItems.length}件をウォッチ</span>}
            </div>
            <p className="px-4 py-3 text-sm leading-6 text-secondary">
                {watchedItems.length === 0
                    ? '案件詳細で結果をウォッチすると、ここで確認できます。'
                    : `結果 ${resolved.length}件 · 結果待ち ${waiting}件`}
            </p>
            {watchedItems.length === 0 && (
                <Link href="/search" className="mb-4 ml-4 inline-flex items-center gap-1.5 text-sm font-bold text-accent hover:underline">
                    ウォッチする案件を探す <ArrowRight size={14} aria-hidden />
                </Link>
            )}

            {resolved.length > 0 && (
                <div className="divide-y divide-border border-t border-border">
                    {resolved.map(item => (
                        <div
                            key={item.id}
                            className="flex items-start justify-between gap-2.5 px-2.5 py-2.5 odd:bg-paper-stripe"
                        >
                            <Link href={`/project/${item.id}`} className="group min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${item.status === '落札'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}
                                    >
                                        <CheckCircle2 size={11} />
                                        {displayStatus(item)}
                                    </span>
                                    <MunicipalityBadge name={item.municipality} />
                                    {item.biddingDate && <span className="text-secondary tabular-nums">開札 {formatDate(item.biddingDate)}</span>}
                                </div>
                                <p className="mt-1.5 text-sm leading-6 font-bold break-words text-primary group-hover:text-accent group-hover:underline">
                                    {item.title}
                                </p>
                                {item.winningContractor && (
                                    <p className="mt-1 text-xs font-bold text-emerald-800">落札者: {item.winningContractor}</p>
                                )}
                            </Link>
                            <button
                                type="button"
                                onClick={() => removeWatch(item.id)}
                                title="確認済みにしてウォッチを外す"
                                aria-label={`${item.title}を確認済みにしてウォッチを外す`}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border text-secondary hover:bg-paper-tint hover:text-accent"
                            >
                                <X size={13} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
            {waitingItems.length > 0 && (
                <div className="border-t border-border px-4 py-3">
                    <p className="mb-2 text-xs font-semibold text-secondary">結果を待っている案件</p>
                    <ul className="space-y-2.5">
                        {waitingItems.map(item => (
                            <li key={item.id}>
                                <Link href={`/project/${item.id}`} className="block text-sm font-semibold leading-6 hover:text-accent hover:underline">{item.title}</Link>
                                <span className="text-xs text-secondary">{item.municipality} · {item.biddingDate ? `開札 ${formatDate(item.biddingDate)}` : '開札日未定'}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
}

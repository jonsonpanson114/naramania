'use client';

import { useEffect, useState } from 'react';
import { BiddingItem } from '@/types/bidding';
import { CheckCircle2, X } from 'lucide-react';
import Link from 'next/link';
import { WATCH_CHANGE_EVENT, getWatchedIds, removeWatch } from '@/lib/watchlist';

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
    const waiting = watchedItems.length - resolved.length;

    return (
        <section className="paper-panel p-2.5" aria-labelledby="watch-results-heading">
            <h2 className="paper-heading" id="watch-results-heading">あなたのウォッチ</h2>
            <p className="px-2.5 py-2 text-sm leading-6 text-secondary">
                {watchedItems.length === 0
                    ? '案件詳細で結果をウォッチすると、ここで確認できます。'
                    : `結果 ${resolved.length}件 · 開札待ち ${waiting}件`}
            </p>

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
                                        {item.status}
                                    </span>
                                    <span className="text-secondary">{item.municipality}</span>
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
        </section>
    );
}

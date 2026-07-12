'use client';

import { useEffect, useState } from 'react';
import { BiddingItem } from '@/types/bidding';
import { BellRing, CheckCircle2, X } from 'lucide-react';
import Link from 'next/link';
import { WATCH_CHANGE_EVENT, getWatchedIds, removeWatch } from '@/lib/watchlist';

function formatDate(dateStr?: string): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

/**
 * ウォッチ中の案件に結果（落札・不調）が出たらダッシュボード最上部で知らせる。
 * まだ結果が出ていないウォッチは件数だけ控えめに表示する。
 */
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

    if (watchedIds.length === 0) return null;

    const watchedItems = items.filter(item => watchedIds.includes(item.id));
    const resolved = watchedItems.filter(item => item.status === '落札' || item.status === '不調');
    const waiting = watchedItems.length - resolved.length;

    if (resolved.length === 0 && waiting === 0) return null;

    return (
        <section className="mb-6 rounded-[2rem] border border-amber-300/80 bg-amber-50/70 p-5 shadow-sm lg:p-6" aria-label="結果ウォッチ">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500 text-white">
                        <BellRing size={16} />
                    </span>
                    <div>
                        <h3 className="text-lg font-bold tracking-[0.04em] text-stone-900">
                            結果ウォッチ
                            {resolved.length > 0 && (
                                <span className="ml-2 rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white">
                                    結果が出ました {resolved.length}件
                                </span>
                            )}
                        </h3>
                        <p className="text-xs tracking-[0.06em] text-stone-500">
                            {waiting > 0 ? `開札待ち ${waiting}件をウォッチ中` : 'ウォッチ中の案件はすべて結果が出ています'}
                        </p>
                    </div>
                </div>
            </div>

            {resolved.length > 0 && (
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {resolved.map(item => (
                        <div
                            key={item.id}
                            className={`flex items-start justify-between gap-3 rounded-2xl border p-4 shadow-sm ${item.status === '落札'
                                ? 'border-emerald-200 bg-white'
                                : 'border-amber-200 bg-white'
                            }`}
                        >
                            <Link href={`/project/${item.id}`} className="group min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold tracking-[0.12em]">
                                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${item.status === '落札'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}
                                    >
                                        <CheckCircle2 size={11} />
                                        {item.status}
                                    </span>
                                    <span className="text-stone-500">{item.municipality}</span>
                                    {item.biddingDate && <span className="tabular-nums text-stone-400">開札 {formatDate(item.biddingDate)}</span>}
                                </div>
                                <p className="mt-1.5 line-clamp-2 text-[13px] font-bold leading-6 text-stone-900 transition group-hover:text-amber-700">
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
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-stone-200 text-stone-400 transition hover:border-stone-400 hover:text-stone-700"
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

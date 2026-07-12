'use client';

import { useEffect, useState } from 'react';
import { BiddingItem } from '@/types/bidding';
import { Sparkles, ArrowRight, MapPin } from 'lucide-react';
import Link from 'next/link';

const LAST_VISIT_KEY = 'naramania_last_visit';

function toDateOnly(value: string): string {
    return value.slice(0, 10);
}

function formatDate(dateStr?: string): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

export function RecentChangesPanel({ items }: { items: BiddingItem[] }) {
    const [sinceDate, setSinceDate] = useState<string | null>(null);
    const [isFirstVisit, setIsFirstVisit] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            const stored = localStorage.getItem(LAST_VISIT_KEY);
            const today = new Date();
            const fallback = new Date(today);
            fallback.setDate(fallback.getDate() - 7);
            const fallbackIso = `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, '0')}-${String(fallback.getDate()).padStart(2, '0')}`;

            setSinceDate(stored ? toDateOnly(stored) : fallbackIso);
            setIsFirstVisit(!stored);

            const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            localStorage.setItem(LAST_VISIT_KEY, todayIso);
        }, 0);

        return () => window.clearTimeout(timer);
    }, []);

    if (!sinceDate) return null;

    const newItems = items
        .filter(item => item.announcementDate && toDateOnly(item.announcementDate) >= sinceDate)
        .sort((a, b) => (b.announcementDate || '').localeCompare(a.announcementDate || ''));

    if (newItems.length === 0) return null;

    const visible = newItems.slice(0, 6);

    return (
        <section className="mb-6 rounded-[2rem] border border-sky-200/80 bg-sky-50/60 p-5 shadow-sm lg:p-7" aria-label="新着公告">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-600 text-white">
                        <Sparkles size={16} />
                    </span>
                    <div>
                        <h3 className="text-lg font-bold tracking-[0.04em] text-stone-900">
                            新着公告 <span className="ml-1 tabular-nums text-sky-700">{newItems.length}件</span>
                        </h3>
                        <p className="text-xs tracking-[0.06em] text-stone-500">
                            {isFirstVisit ? '直近7日の公告' : `前回確認（${formatDate(sinceDate)}）以降の公告`}
                        </p>
                    </div>
                </div>
                <Link
                    href="/search"
                    className="inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-white px-4 py-2 text-[11px] font-bold tracking-[0.12em] text-sky-700 transition hover:bg-sky-100"
                >
                    一覧で見る
                    <ArrowRight size={13} />
                </Link>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {visible.map(item => (
                    <Link
                        key={item.id}
                        href={`/project/${item.id}`}
                        className="group rounded-2xl border border-sky-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md"
                    >
                        <div className="flex items-center justify-between gap-2 text-[10px] font-bold tracking-[0.14em]">
                            <span className="inline-flex items-center gap-1 text-stone-500">
                                <MapPin size={11} />
                                {item.municipality}
                            </span>
                            <span className="tabular-nums text-sky-700">公告 {formatDate(item.announcementDate)}</span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-[13px] font-bold leading-6 tracking-[0.02em] text-stone-900 transition group-hover:text-sky-800">
                            {item.title}
                        </p>
                        <div className="mt-2 flex items-center justify-between text-[10px] tracking-[0.1em] text-stone-400">
                            <span>{item.type}</span>
                            {item.biddingDate && <span className="tabular-nums">開札 {formatDate(item.biddingDate)}</span>}
                        </div>
                    </Link>
                ))}
            </div>
        </section>
    );
}

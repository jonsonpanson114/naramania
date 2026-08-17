'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarClock } from 'lucide-react';
import type { BiddingItem } from '@/types/bidding';
import type { OpeningResultUpdate } from '@/lib/opening_result_updates';
import type { ResultFollowUpEntry } from '@/lib/result_follow_up';

const LAST_VISIT_KEY = 'naramania_last_visit';

type TabKey = 'new' | 'upcoming' | 'results' | 'followUp';

function toDateOnly(value: string): string {
    return value.slice(0, 10);
}

function formatDate(dateStr?: string): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

function daysUntilLabel(dateStr?: string): string {
    if (!dateStr) return '日程未定';
    const today = new Date();
    const target = new Date(dateStr);
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
    if (Number.isNaN(diff)) return '日程未定';
    if (diff < 0) return '終了';
    if (diff === 0) return '本日';
    if (diff === 1) return '明日';
    return `${diff}日後`;
}

/** 全タブ共通の1行。左に自治体、中央に案件名、右に日付や結果を置く */
function Row({
    href,
    municipality,
    title,
    meta,
    emphasis,
}: {
    href: string;
    municipality: string;
    title: string;
    meta: string;
    emphasis?: 'warn' | 'good';
}) {
    const metaColor =
        emphasis === 'warn' ? 'text-rose-600'
        : emphasis === 'good' ? 'text-emerald-700'
        : 'text-secondary/60';
    return (
        <Link
            href={href}
            className="group flex items-center gap-3 border-b border-border/30 px-2 py-3.5 transition-colors last:border-b-0 hover:bg-accent/[0.04]"
        >
            <span className="w-24 shrink-0 truncate text-[13px] tracking-wider text-secondary/70">
                {municipality}
            </span>
            <span className="min-w-0 flex-1 truncate text-[15px] leading-7 text-primary transition-colors group-hover:text-accent">
                {title}
            </span>
            <span className={`shrink-0 text-[13px] font-medium tabular-nums tracking-wider ${metaColor}`}>
                {meta}
            </span>
        </Link>
    );
}

interface TodayFocusPanelProps {
    /** 新着公告の判定に使う全件 */
    items: BiddingItem[];
    upcoming: BiddingItem[];
    openingResults: OpeningResultUpdate[];
    followUp: ResultFollowUpEntry[];
    activeCount: number;
}

export function TodayFocusPanel({
    items,
    upcoming,
    openingResults,
    followUp,
    activeCount,
}: TodayFocusPanelProps) {
    // 未選択のうちはデータから既定タブを決める（effectでsetStateしないため派生値にする）
    const [selectedTab, setSelectedTab] = useState<TabKey | null>(null);
    const [sinceDate, setSinceDate] = useState<string | null>(null);
    const [isFirstVisit, setIsFirstVisit] = useState(false);

    // 前回訪問日はブラウザにしか無いので、マウント後に読む
    useEffect(() => {
        const timer = window.setTimeout(() => {
            const stored = localStorage.getItem(LAST_VISIT_KEY);
            const today = new Date();
            const fallback = new Date(today);
            fallback.setDate(fallback.getDate() - 7);
            const pad = (n: number) => String(n).padStart(2, '0');
            const fallbackIso = `${fallback.getFullYear()}-${pad(fallback.getMonth() + 1)}-${pad(fallback.getDate())}`;

            setSinceDate(stored ? toDateOnly(stored) : fallbackIso);
            setIsFirstVisit(!stored);

            const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
            localStorage.setItem(LAST_VISIT_KEY, todayIso);
        }, 0);
        return () => window.clearTimeout(timer);
    }, []);

    const newItems = useMemo(() => {
        if (!sinceDate) return [];
        return items
            .filter(item => item.announcementDate && toDateOnly(item.announcementDate) >= sinceDate)
            .sort((a, b) => (b.announcementDate || '').localeCompare(a.announcementDate || ''));
    }, [items, sinceDate]);

    // 新着が無い日は直近開札を初期表示にする
    const tab: TabKey = selectedTab ?? (sinceDate && newItems.length === 0 ? 'upcoming' : 'new');
    const setTab = setSelectedTab;

    const tabs: Array<{ key: TabKey; label: string; count: number }> = [
        { key: 'new', label: '新着公告', count: newItems.length },
        { key: 'upcoming', label: '直近開札', count: upcoming.length },
        { key: 'results', label: '開札結果', count: openingResults.length },
        { key: 'followUp', label: '追跡待ち', count: followUp.length },
    ];

    const stats: Array<{ label: string; value: number; tone: string; tab?: TabKey; href?: string }> = [
        { label: '受付中', value: activeCount, tone: 'text-emerald-200', href: '/search?quick=active' },
        { label: '直近開札', value: upcoming.length, tone: 'text-amber-200', tab: 'upcoming' },
        { label: '新着', value: newItems.length, tone: 'text-sky-200', tab: 'new' },
        { label: '追跡待ち', value: followUp.length, tone: 'text-rose-200', tab: 'followUp' },
        { label: '落札判明', value: openingResults.length, tone: 'text-stone-100', tab: 'results' },
    ];

    const seeAllHref =
        tab === 'followUp' ? '/search?quick=resultFollowUp'
        : tab === 'results' ? '/search?quick=opened'
        : '/search?quick=active';

    return (
        <section className="mb-8" aria-label="今日見るところ">
            {/* 数字だけの横1行。詳細は下のタブで切り替える */}
            <div className="rounded-t-[2rem] border border-amber-200/70 bg-gradient-to-br from-stone-950 via-stone-900 to-amber-950 px-5 py-4 text-white shadow-soft lg:px-7">
                <div className="mb-3 flex items-center gap-2">
                    <CalendarClock size={15} className="text-amber-200" />
                    <span className="text-[12px] font-bold uppercase tracking-[0.24em] text-amber-100">
                        Today Focus
                    </span>
                    {sinceDate && (
                        <span className="ml-auto text-[12px] tracking-wider text-stone-400">
                            {isFirstVisit ? '直近7日' : `前回確認 ${formatDate(sinceDate)} 以降`}
                        </span>
                    )}
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {stats.map(stat => {
                        const inner = (
                            <>
                                <p className="text-[12px] tracking-[0.14em] text-stone-300">{stat.label}</p>
                                <p className={`mt-1 text-3xl font-light tabular-nums ${stat.tone}`}>{stat.value}</p>
                            </>
                        );
                        const cls = `rounded-2xl bg-white/10 px-2 py-2.5 text-center transition hover:bg-white/20 ${
                            stat.tab && stat.tab === tab ? 'ring-1 ring-amber-200/60' : ''
                        }`;
                        return stat.href ? (
                            <Link key={stat.label} href={stat.href} className={cls}>{inner}</Link>
                        ) : (
                            <button key={stat.label} onClick={() => stat.tab && setTab(stat.tab)} className={cls}>
                                {inner}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 4つのパネルを1つにまとめ、タブで切り替える */}
            <div className="rounded-b-[2rem] border border-t-0 border-stone-200 bg-white/80 px-3 pb-3 shadow-sm lg:px-5">
                <div className="flex flex-wrap items-center gap-1 border-b border-border/40 pt-3">
                    {tabs.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`rounded-t-lg px-4 py-3 text-[15px] tracking-wider transition-colors ${
                                tab === t.key
                                    ? 'border-b-2 border-accent font-semibold text-primary'
                                    : 'text-secondary/60 hover:text-accent'
                            }`}
                        >
                            {t.label}
                            <span className="ml-1.5 tabular-nums text-[13px] text-secondary/50">{t.count}</span>
                        </button>
                    ))}
                </div>

                <div className="min-h-[132px]">
                    {tab === 'new' && (newItems.length > 0 ? newItems.slice(0, 5).map(item => (
                        <Row
                            key={item.id}
                            href={`/project/${item.id}`}
                            municipality={item.municipality}
                            title={item.title}
                            meta={`公告 ${formatDate(item.announcementDate)}`}
                        />
                    )) : <Empty text="新しい公告はありません" />)}

                    {tab === 'upcoming' && (upcoming.length > 0 ? upcoming.slice(0, 5).map(item => (
                        <Row
                            key={item.id}
                            href={`/project/${item.id}`}
                            municipality={item.municipality}
                            title={item.title}
                            meta={daysUntilLabel(item.biddingDate)}
                            emphasis="warn"
                        />
                    )) : <Empty text="直近の開札予定はありません" />)}

                    {tab === 'results' && (openingResults.length > 0 ? openingResults.slice(0, 5).map(result => (
                        <Row
                            key={result.id}
                            href={`/project/${result.id}`}
                            municipality={result.municipality}
                            title={result.title}
                            meta={result.winningContractor || (result.status === '不調' ? '不調' : result.status)}
                            emphasis="good"
                        />
                    )) : <Empty text="新しい開札結果はありません" />)}

                    {tab === 'followUp' && (followUp.length > 0 ? followUp.slice(0, 5).map(entry => (
                        <Row
                            key={entry.item.id}
                            href={`/project/${entry.item.id}`}
                            municipality={entry.item.municipality}
                            title={entry.item.title}
                            meta={entry.ageDays !== null ? `${entry.ageDays}日経過` : '開札日なし'}
                            emphasis="warn"
                        />
                    )) : <Empty text="追跡待ちの案件はありません" />)}
                </div>

                <div className="flex justify-end pt-2">
                    <Link
                        href={seeAllHref}
                        className="inline-flex items-center gap-1.5 text-[13px] tracking-wider text-secondary/60 transition-colors hover:text-accent"
                    >
                        一覧で見る
                        <ArrowRight size={14} />
                    </Link>
                </div>
            </div>
        </section>
    );
}

function Empty({ text }: { text: string }) {
    return (
        <p className="py-12 text-center text-[14px] tracking-wider text-secondary/40">{text}</p>
    );
}

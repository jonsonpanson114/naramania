'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { BiddingItem } from '@/types/bidding';
import type { OpeningResultUpdate } from '@/lib/opening_result_updates';
import type { ResultFollowUpEntry } from '@/lib/result_follow_up';
import { addDaysJstDateKey, toJstDateKey } from '@/lib/jst_date';
import { displayStatus } from '@/lib/status_label';

const LAST_VISIT_KEY = 'naramania_last_visit';

type TabKey = 'new' | 'upcoming' | 'results' | 'followUp';

type FocusEntry = {
    id: string;
    municipality: string;
    title: string;
    meta: string;
};

const tabDetails: Record<TabKey, { label: string; href: string; empty: string }> = {
    new: { label: '新着公告', href: '/search?quick=newArrivals', empty: '新しい公告はありません' },
    upcoming: { label: '直近開札', href: '/search?quick=upcomingBidding', empty: '直近の開札予定はありません' },
    results: { label: '開札結果', href: '/search?quick=opened', empty: '新しい開札結果はありません' },
    followUp: { label: '追跡待ち', href: '/search?quick=resultFollowUp', empty: '追跡待ちの案件はありません' },
};

function formatDate(dateStr?: string): string {
    if (!dateStr) return '日程未定';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' });
}

function announcementEntry(item: BiddingItem): FocusEntry {
    return { ...item, meta: `公告 ${formatDate(item.announcementDate)}` };
}

interface TodayFocusPanelProps {
    items: BiddingItem[];
    upcoming: BiddingItem[];
    openingResults: OpeningResultUpdate[];
    followUp: ResultFollowUpEntry[];
    activeCount: number;
    today: string;
}

export function TodayFocusPanel({
    items,
    upcoming,
    openingResults,
    followUp,
    activeCount,
    today,
}: TodayFocusPanelProps) {
    const [selectedTab, setSelectedTab] = useState<TabKey | null>(null);
    const [lastVisit, setLastVisit] = useState<string | null>(null);
    const sinceDate = lastVisit ?? addDaysJstDateKey(-7, new Date(`${today}T12:00:00+09:00`));

    useEffect(() => {
        const timer = window.setTimeout(() => {
            try {
                const stored = localStorage.getItem(LAST_VISIT_KEY);
                setLastVisit(stored?.slice(0, 10) || null);
                localStorage.setItem(LAST_VISIT_KEY, toJstDateKey());
            } catch {
                // 保存できない環境では初回と同じ直近7日を表示する。
            }
        }, 0);
        return () => window.clearTimeout(timer);
    }, []);

    const newItems = useMemo(() => items
        .filter(item => item.announcementDate && item.announcementDate.slice(0, 10) >= sinceDate)
        .sort((a, b) => b.announcementDate.localeCompare(a.announcementDate)), [items, sinceDate]);
    const tab = selectedTab ?? (newItems.length === 0 ? 'upcoming' : 'new');
    const results = openingResults.map(result => ({
        ...result,
        meta: result.winningContractor || displayStatus(result),
    }));
    const openings = upcoming.map(item => ({ ...item, meta: `開札 ${formatDate(item.biddingDate)}` }));
    const entries: Record<TabKey, FocusEntry[]> = {
        new: newItems.map(announcementEntry),
        upcoming: openings,
        results,
        followUp: followUp.map(({ item, ageDays }) => ({
            ...item,
            meta: ageDays !== null ? `${ageDays}日経過` : '開札日なし',
        })),
    };
    const digest: Array<FocusEntry & { label: string }> = [];
    if (entries.new[0]) digest.push({ ...entries.new[0], label: '新着公告' });
    if (openings[0] && !digest.some(entry => entry.id === openings[0].id)) {
        digest.push({ ...openings[0], label: '直近開札' });
    }
    const recentResult = results.find(entry => !digest.some(featured => featured.id === entry.id));
    if (recentResult) digest.push({ ...recentResult, label: '開札結果' });
    if (digest.length === 0) {
        const latest = items.find(item => !item.isForecast && item.announcementDate && item.announcementDate.slice(0, 10) <= today);
        if (latest) digest.push({ ...announcementEntry(latest), label: '最近の公告' });
    }

    return (
        <>
            <section className="paper-panel p-2.5" aria-labelledby="today-digest">
                <h2 className="paper-heading" id="today-digest">今日のダイジェスト</h2>
                <div className="grid items-center gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                    {digest.length > 0 ? (
                        <ol className="min-w-0">
                            {digest.map((entry, index) => (
                                <li key={entry.id} className="border-b border-border last:border-b-0">
                                    <Link href={`/project/${entry.id}`} className="group flex items-start gap-3 rounded px-2.5 py-2.5 hover:bg-paper-tint sm:py-3">
                                        <span aria-hidden="true" className="font-serif text-2xl leading-none font-bold text-amber-800">{index + 1}</span>
                                        <div className="min-w-0">
                                            <p className="text-xs leading-5 font-bold text-accent">{entry.label}</p>
                                            <p className="mt-0.5 text-[15px] leading-6 font-bold break-words group-hover:underline sm:text-base">{entry.title}</p>
                                            <p className="mt-0.5 text-[13px] leading-5 break-words text-secondary">{entry.municipality} · {entry.meta}</p>
                                        </div>
                                    </Link>
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <p className="px-3 py-5 text-sm leading-6 text-secondary">現在表示できる案件はありません。</p>
                    )}
                    <div className="hidden overflow-hidden rounded bg-paper-tint xl:block">
                        <Image
                            src="/morning-civic-illustration.png"
                            alt=""
                            width={640}
                            height={400}
                            className="aspect-[1.75] w-full object-cover"
                            sizes="(min-width: 1280px) 360px, 1px"
                        />
                    </div>
                </div>
            </section>

            <section className="paper-panel p-2.5" aria-labelledby="today-list">
                <div className="paper-heading flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <h2 id="today-list">案件の動き</h2>
                    <Link href="/search?quick=active" className="font-sans text-xs font-bold whitespace-nowrap text-accent hover:underline">
                        受付中 <span className="tabular-nums">{activeCount}件</span>
                    </Link>
                </div>
                <div className="flex flex-wrap gap-1.5 px-0.5 py-2.5" role="group" aria-label="案件の表示切替">
                    {(Object.keys(tabDetails) as TabKey[]).map(key => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setSelectedTab(key)}
                            aria-pressed={tab === key}
                            className={`rounded border px-2.5 py-1.5 text-[13px] leading-5 font-semibold transition-colors sm:px-3 sm:text-sm ${
                                tab === key ? 'border-accent bg-accent text-white' : 'border-border text-secondary hover:bg-paper-tint'
                            }`}
                        >
                            {tabDetails[key].label} <span className="ml-0.5 tabular-nums">{entries[key].length}</span>
                        </button>
                    ))}
                </div>
                <div className="px-1 pb-1.5 text-xs leading-5 text-secondary">
                    {tab === 'new' && (lastVisit ? `前回確認 ${formatDate(sinceDate)} 以降` : '直近7日')}
                    {tab === 'upcoming' && '本日から7日後までの開札予定'}
                </div>
                {entries[tab].length > 0 ? (
                    <ul className="border-t border-border">
                        {entries[tab].slice(0, 5).map(entry => (
                            <li key={entry.id} className="border-b border-border odd:bg-paper-stripe">
                                <Link
                                    href={`/project/${entry.id}`}
                                    className="group grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 px-2.5 py-2.5 hover:bg-paper-tint sm:grid-cols-[minmax(0,1fr)_6rem_minmax(5rem,auto)]"
                                >
                                    <span className="col-span-2 text-[15px] leading-6 font-semibold break-words group-hover:underline sm:col-span-1">{entry.title}</span>
                                    <span className="text-[13px] leading-5 text-secondary">{entry.municipality}</span>
                                    <span className="max-w-[10rem] text-right text-[13px] leading-5 break-words text-secondary tabular-nums">{entry.meta}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="border-t border-border px-3 py-5 text-sm text-secondary">{tabDetails[tab].empty}</p>
                )}
                <Link href={tabDetails[tab].href} className="flex w-fit items-center gap-1.5 rounded px-2.5 py-2.5 text-sm font-bold text-accent hover:underline">
                    {tabDetails[tab].label}の一覧
                    <ArrowRight size={15} aria-hidden="true" />
                </Link>
            </section>
        </>
    );
}

'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CalendarDays, FileText, CheckCircle2 } from 'lucide-react';
import type { BiddingItem } from '@/types/bidding';
import type { OpeningResultUpdate } from '@/lib/opening_result_updates';
import type { ResultFollowUpEntry } from '@/lib/result_follow_up';
import { addDaysJstDateKey, toJstDateKey } from '@/lib/jst_date';
import { displayStatus } from '@/lib/status_label';
import { MunicipalityBadge, ProjectTypeBadge } from '@/components/ProjectLabels';

const LAST_VISIT_KEY = 'naramania_last_visit';

type TabKey = 'new' | 'upcoming' | 'results' | 'followUp';

type FocusEntry = {
    id: string;
    municipality: string;
    title: string;
    meta: string;
    type?: string;
    status?: BiddingItem['status'];
    cancelled?: boolean;
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
    watchPanel: ReactNode;
}

export function TodayFocusPanel({
    items,
    upcoming,
    openingResults,
    followUp,
    activeCount,
    today,
    watchPanel,
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
    const digest: Array<FocusEntry & { label: string; kind: TabKey }> = [];
    if (entries.new[0]) digest.push({ ...entries.new[0], label: '新着公告', kind: 'new' });
    if (openings[0] && !digest.some(entry => entry.id === openings[0].id)) {
        digest.push({ ...openings[0], label: '直近開札', kind: 'upcoming' });
    }
    const recentResult = results.find(entry => !digest.some(featured => featured.id === entry.id));
    if (recentResult) digest.push({ ...recentResult, label: '開札結果', kind: 'results' });
    if (digest.length === 0) {
        const latest = items.find(item => !item.isForecast && item.announcementDate && item.announcementDate.slice(0, 10) <= today);
        if (latest) digest.push({ ...announcementEntry(latest), label: '最近の公告', kind: 'new' });
    }

    return (
        <>
            <section className="paper-panel home-digest" aria-labelledby="today-digest">
                <div className="home-section-heading">
                    <h2 id="today-digest">今日のダイジェスト</h2>
                    <span>公告・予定・結果を確認</span>
                </div>
                <div className="home-digest-body">
                    {digest.length > 0 ? (
                        <ol className="home-digest-grid">
                            {digest.map((entry, index) => (
                                <li key={entry.id} className={index === 0 ? 'home-digest-featured' : 'home-digest-secondary'}>
                                    <Link href={`/project/${entry.id}`} className="home-digest-link group">
                                        <span className="home-digest-kind" data-kind={entry.kind}>
                                            {entry.kind === 'upcoming' ? <CalendarDays size={15} aria-hidden /> : entry.kind === 'results' ? <CheckCircle2 size={15} aria-hidden /> : <FileText size={15} aria-hidden />}
                                            {entry.label}
                                        </span>
                                        <p className="home-digest-title group-hover:underline">{entry.title}</p>
                                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                            <MunicipalityBadge name={entry.municipality} />
                                            {entry.type && <ProjectTypeBadge type={entry.type} />}
                                            {entry.status && entry.kind !== 'results' && <span className="text-xs font-semibold text-secondary">{displayStatus({ status: entry.status, cancelled: entry.cancelled })}</span>}
                                        </div>
                                        <p className="home-digest-meta">{entry.meta}</p>
                                        <span className="home-digest-cta">案件詳細へ <ArrowRight size={14} aria-hidden /></span>
                                    </Link>
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <p className="px-3 py-5 text-sm leading-6 text-secondary">現在表示できる案件はありません。</p>
                    )}
                    <div className="home-digest-art" aria-hidden="true">
                        <Image
                            src="/morning-civic-illustration.png"
                            alt=""
                            width={640}
                            height={400}
                            className="w-full"
                            sizes="(min-width: 1280px) 280px, 1px"
                        />
                    </div>
                </div>
            </section>

            {watchPanel}

            <section className="paper-panel home-list" aria-labelledby="today-list">
                <div className="home-section-heading">
                    <h2 id="today-list">案件の動き</h2>
                    <Link href="/search?quick=active" className="font-sans text-xs font-bold whitespace-nowrap text-accent hover:underline">
                        受付中 <span className="tabular-nums">{activeCount}件</span>
                    </Link>
                </div>
                <div className="home-tabs" role="group" aria-label="案件の表示切替">
                    {(Object.keys(tabDetails) as TabKey[]).map(key => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setSelectedTab(key)}
                            aria-pressed={tab === key}
                            className="home-tab"
                        >
                            <span>{tabDetails[key].label}</span>
                            <strong>{entries[key].length}<span className="ml-1 text-xs font-normal">件</span></strong>
                        </button>
                    ))}
                </div>
                <div className="px-4 pb-2 text-xs leading-5 text-secondary">
                    {tab === 'new' && (lastVisit ? `前回確認 ${formatDate(sinceDate)} 以降` : '直近7日')}
                    {tab === 'upcoming' && '本日から7日後までの開札予定'}
                </div>
                {entries[tab].length > 0 ? (
                    <ul className="border-t border-border">
                        {entries[tab].slice(0, 5).map(entry => (
                            <li key={entry.id} className="border-b border-border odd:bg-paper-stripe">
                                <Link
                                    href={`/project/${entry.id}`}
                                    className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 hover:bg-paper-tint sm:grid-cols-[minmax(0,1fr)_6rem_minmax(5rem,auto)]"
                                >
                                    <span className="col-span-2 text-[15px] leading-6 font-semibold break-words group-hover:underline sm:col-span-1">{entry.title}</span>
                                    <MunicipalityBadge name={entry.municipality} />
                                    <span className="max-w-[10rem] text-right text-[13px] leading-5 break-words text-secondary tabular-nums">{entry.meta}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="border-t border-border px-3 py-5 text-sm text-secondary">{tabDetails[tab].empty}</p>
                )}
                <Link href={tabDetails[tab].href} className="flex w-fit items-center gap-1.5 rounded px-4 py-3 text-sm font-bold text-accent hover:underline">
                    {tabDetails[tab].label}の一覧
                    <ArrowRight size={15} aria-hidden="true" />
                </Link>
            </section>
        </>
    );
}

'use client';

import { useMemo, useState } from 'react';
import { BiddingItem } from '@/types/bidding';
import { AppShell } from '@/components/AppShell';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AlertTriangle,
    Award,
    Bookmark,
    Briefcase,
    Building2,
    CalendarClock,
    ExternalLink,
    FileText,
    Layers,
    MapPin,
    Send,
    Trash2,
    TrendingUp,
    Trophy,
    type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';

type SalesStatus = 'pending' | 'active' | 'negotiating' | 'won' | 'lost';

interface SavedBiddingItem extends BiddingItem {
    salesStatus?: SalesStatus;
}

const statusConfig: Record<SalesStatus, { label: string; color: string; bg: string; border: string; icon: LucideIcon }> = {
    pending: { label: 'アプローチ前', color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200', icon: Layers },
    active: { label: '元請け営業中', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: Send },
    negotiating: { label: '見積提示中', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: TrendingUp },
    won: { label: '受注確定', color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', icon: Award },
    lost: { label: '失注', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: AlertTriangle },
};

function formatDate(dateStr?: string): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

function sortDate(value?: string, fallback = Number.POSITIVE_INFINITY): number {
    if (!value) return fallback;
    const date = new Date(value).getTime();
    return Number.isNaN(date) ? fallback : date;
}

function biddingDistance(dateStr?: string): { label: string; urgent: boolean; done: boolean; diff: number | null } {
    if (!dateStr) return { label: '日程未定', urgent: false, done: false, diff: null };
    const today = new Date();
    const target = new Date(dateStr);
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (Number.isNaN(diff)) return { label: '日程未定', urgent: false, done: false, diff: null };
    if (diff < 0) return { label: '開札済み', urgent: false, done: true, diff };
    if (diff === 0) return { label: '本日', urgent: true, done: false, diff };
    if (diff === 1) return { label: '明日', urgent: true, done: false, diff };
    return { label: `${diff}日後`, urgent: diff <= 7, done: false, diff };
}

function itemTone(distance: ReturnType<typeof biddingDistance>) {
    if (distance.urgent) return {
        rail: 'border-rose-100 bg-rose-50/90',
        badge: 'bg-rose-600 text-white',
        date: 'text-rose-700',
    };
    if (distance.done) return {
        rail: 'border-stone-100 bg-stone-50',
        badge: 'bg-stone-300 text-stone-700',
        date: 'text-stone-800',
    };
    return {
        rail: 'border-amber-100 bg-amber-50/80',
        badge: 'bg-amber-300 text-stone-950',
        date: 'text-stone-950',
    };
}

function statusTone(status: BiddingItem['status']) {
    if (status === '受付中') return 'border-sky-200 bg-sky-50 text-sky-700';
    if (status === '落札') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (status === '締切間近' || status === '締切切迫') return 'border-rose-200 bg-rose-50 text-rose-700';
    return 'border-stone-200 bg-stone-50 text-stone-600';
}

export default function SavedPage() {
    const [savedItems, setSavedItems] = useState<SavedBiddingItem[]>(() => {
        if (typeof window === 'undefined') {
            return [];
        }
        const stored = localStorage.getItem('naramania_saved');
        if (stored) {
            try {
                const items = JSON.parse(stored) as SavedBiddingItem[];
                return items.map(item => ({
                    ...item,
                    salesStatus: item.salesStatus || 'pending',
                }));
            } catch (e) {
                console.error(e);
                return [];
            }
        }
        return [];
    });

    const [activeTab, setActiveTab] = useState<SalesStatus | 'all'>('all');

    const updateStatus = (id: string, newStatus: SalesStatus) => {
        const updated = savedItems.map(item =>
            item.id === id ? { ...item, salesStatus: newStatus } : item,
        );
        setSavedItems(updated);
        localStorage.setItem('naramania_saved', JSON.stringify(updated));
    };

    const removeItem = (id: string) => {
        const updated = savedItems.filter(item => item.id !== id);
        setSavedItems(updated);
        localStorage.setItem('naramania_saved', JSON.stringify(updated));
    };

    const getCount = (status: SalesStatus) => savedItems.filter(item => item.salesStatus === status).length;

    const filteredItems = useMemo(() => {
        const items = activeTab === 'all'
            ? savedItems
            : savedItems.filter(item => item.salesStatus === activeTab);

        return [...items].sort((a, b) => {
            const aDistance = biddingDistance(a.biddingDate);
            const bDistance = biddingDistance(b.biddingDate);
            const aOpen = aDistance.diff === null ? Number.POSITIVE_INFINITY : aDistance.diff < 0 ? 10000 + Math.abs(aDistance.diff) : aDistance.diff;
            const bOpen = bDistance.diff === null ? Number.POSITIVE_INFINITY : bDistance.diff < 0 ? 10000 + Math.abs(bDistance.diff) : bDistance.diff;
            if (aOpen !== bOpen) return aOpen - bOpen;
            return sortDate(b.announcementDate, 0) - sortDate(a.announcementDate, 0);
        });
    }, [activeTab, savedItems]);

    const upcomingCount = savedItems.filter(item => {
        const distance = biddingDistance(item.biddingDate);
        return distance.diff !== null && distance.diff >= 0 && distance.diff <= 7;
    }).length;
    const unsentCount = getCount('pending');
    const wonCount = getCount('won');

    return (
        <AppShell>
            <div className="[font-family:'BIZ_UDPGothic','Yu_Gothic','Hiragino_Kaku_Gothic_ProN',sans-serif]">
                <motion.section
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45 }}
                    className="mb-6 overflow-hidden rounded-[2rem] border border-amber-200/70 bg-gradient-to-br from-stone-950 via-stone-900 to-amber-950 p-6 text-white shadow-soft lg:p-7"
                >
                    <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-amber-100">
                                <Bookmark size={14} />
                                Saved Pipeline
                            </div>
                            <h2 className="mt-4 text-3xl font-bold tracking-[0.04em]">保存済み案件</h2>
                            <p className="mt-3 max-w-3xl text-sm leading-7 tracking-[0.04em] text-stone-200/75">
                                保存した案件を、公告日・開札日・残り日数・営業状況で確認できます。近い開札から優先して並べています。
                            </p>
                        </div>
                        <div className="grid w-full max-w-xl grid-cols-3 gap-2 rounded-3xl border border-white/10 bg-white/10 p-2 text-center backdrop-blur">
                            <div className="rounded-2xl bg-white/10 px-3 py-3">
                                <p className="text-[9px] uppercase tracking-[0.2em] text-stone-300">保存中</p>
                                <p className="mt-1 text-2xl font-light tabular-nums text-white">{savedItems.length}</p>
                            </div>
                            <div className="rounded-2xl bg-white/10 px-3 py-3">
                                <p className="text-[9px] uppercase tracking-[0.2em] text-stone-300">7日以内</p>
                                <p className="mt-1 text-2xl font-light tabular-nums text-rose-200">{upcomingCount}</p>
                            </div>
                            <div className="rounded-2xl bg-white/10 px-3 py-3">
                                <p className="text-[9px] uppercase tracking-[0.2em] text-stone-300">受注</p>
                                <p className="mt-1 text-2xl font-light tabular-nums text-emerald-200">{wonCount}</p>
                            </div>
                        </div>
                    </div>
                </motion.section>

                {savedItems.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="rounded-[2rem] border border-dashed border-stone-300 bg-white/75 px-6 py-16 text-center shadow-sm"
                    >
                        <Bookmark className="mx-auto mb-6 h-12 w-12 text-stone-300" />
                        <p className="text-sm font-bold tracking-[0.08em] text-stone-500">保存済み案件はありません</p>
                        <p className="mt-3 text-xs leading-6 tracking-[0.06em] text-stone-400">
                            案件検索やダッシュボードから、営業したい案件を保存してください。
                        </p>
                        <Link href="/search" className="mt-8 inline-flex rounded-full bg-stone-950 px-6 py-3 text-xs font-bold tracking-[0.14em] text-white transition hover:bg-amber-700">
                            案件を探す
                        </Link>
                    </motion.div>
                ) : (
                    <div className="space-y-5">
                        <div className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white/80 shadow-sm">
                            <div className="flex flex-col gap-4 border-b border-stone-200 bg-white p-5 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-stone-400">Sales Status</p>
                                    <h3 className="mt-2 text-xl font-bold tracking-[0.04em] text-stone-950">営業状況で絞り込み</h3>
                                </div>
                                <div className="inline-flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold tracking-[0.08em] text-amber-800">
                                    <Briefcase size={15} />
                                    アプローチ前 {unsentCount} 件
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2 p-5">
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('all')}
                                    className={`rounded-full border px-4 py-2 text-xs font-bold tracking-[0.1em] transition ${
                                        activeTab === 'all'
                                            ? 'border-stone-950 bg-stone-950 text-white'
                                            : 'border-stone-200 bg-white text-stone-500 hover:border-stone-500 hover:text-stone-950'
                                    }`}
                                >
                                    すべて <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5">{savedItems.length}</span>
                                </button>
                                {(Object.keys(statusConfig) as SalesStatus[]).map((status) => {
                                    const config = statusConfig[status];
                                    const Icon = config.icon;
                                    const isActive = activeTab === status;
                                    return (
                                        <button
                                            key={status}
                                            type="button"
                                            onClick={() => setActiveTab(status)}
                                            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold tracking-[0.1em] transition ${
                                                isActive
                                                    ? `${config.bg} ${config.color} ${config.border} shadow-sm`
                                                    : 'border-stone-200 bg-white text-stone-500 hover:border-stone-500 hover:text-stone-950'
                                            }`}
                                        >
                                            <Icon size={14} />
                                            {config.label}
                                            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-500">{getCount(status)}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {filteredItems.length === 0 ? (
                            <div className="rounded-[2rem] border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
                                <p className="text-sm tracking-[0.08em] text-stone-400">このステータスの保存案件はありません。</p>
                            </div>
                        ) : (
                            <motion.div layout className="grid gap-3">
                                <AnimatePresence mode="popLayout">
                                    {filteredItems.map((item, index) => {
                                        const currentStatus = item.salesStatus || 'pending';
                                        const config = statusConfig[currentStatus];
                                        const StatusIcon = config.icon;
                                        const distance = biddingDistance(item.biddingDate);
                                        const tone = itemTone(distance);
                                        return (
                                            <motion.article
                                                key={item.id}
                                                layout
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.98 }}
                                                transition={{ duration: 0.25, delay: Math.min(index * 0.015, 0.15) }}
                                                className="group overflow-hidden rounded-[1.25rem] border border-stone-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md"
                                            >
                                                <div className="grid lg:grid-cols-[128px_minmax(0,1fr)_270px]">
                                                    <div className={`border-b p-4 lg:border-b-0 lg:border-r ${tone.rail}`}>
                                                        <p className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] ${tone.badge}`}>
                                                            {distance.label}
                                                        </p>
                                                        <p className="mt-3 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-stone-500">
                                                            <CalendarClock size={12} /> 開札日
                                                        </p>
                                                        <p className={`mt-1 text-2xl font-bold tabular-nums tracking-tight ${tone.date}`}>
                                                            {formatDate(item.biddingDate)}
                                                        </p>
                                                        <div className="mt-3 rounded-xl border border-white/80 bg-white/70 px-3 py-2">
                                                            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">公告</p>
                                                            <p className="mt-0.5 text-sm tabular-nums text-stone-700">{formatDate(item.announcementDate)}</p>
                                                        </div>
                                                    </div>

                                                    <div className="p-4 lg:p-5">
                                                        <div className="flex flex-wrap items-center gap-2.5">
                                                            <span className={`rounded-full border px-3 py-1 text-[10px] font-bold tracking-[0.14em] ${statusTone(item.status)}`}>
                                                                {item.status}
                                                            </span>
                                                            <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] text-stone-600">
                                                                <MapPin size={12} />
                                                                {item.municipality}
                                                            </span>
                                                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] text-amber-700">
                                                                <Building2 size={12} />
                                                                {item.type}
                                                            </span>
                                                        </div>

                                                        <Link
                                                            href={`/project/${item.id}`}
                                                            className="mt-3 block text-[18px] font-bold leading-8 tracking-[0.02em] text-stone-950 transition group-hover:text-amber-700 lg:text-[20px]"
                                                        >
                                                            {item.title}
                                                        </Link>

                                                        <div className="mt-4 grid gap-2 sm:grid-cols-3">
                                                            <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
                                                                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">予定価格</p>
                                                                <p className="mt-1 line-clamp-1 text-xs font-bold tracking-[0.04em] text-stone-700">{item.estimatedPrice || '未取得'}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
                                                                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">工期</p>
                                                                <p className="mt-1 line-clamp-1 text-xs font-bold tracking-[0.04em] text-stone-700">{item.constructionPeriod || '未取得'}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
                                                                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">資料</p>
                                                                <p className="mt-1 line-clamp-1 text-xs font-bold tracking-[0.04em] text-stone-700">{item.pdfUrl ? 'PDFあり' : '公式ページ'}</p>
                                                            </div>
                                                        </div>

                                                        {item.description && (
                                                            <p className="mt-3 line-clamp-1 text-xs leading-6 tracking-[0.04em] text-stone-500">
                                                                {item.description}
                                                            </p>
                                                        )}
                                                    </div>

                                                    <div className="border-t border-stone-100 bg-gradient-to-br from-stone-50 to-white p-3 lg:border-l lg:border-t-0">
                                                        <div className="rounded-xl border border-stone-200 bg-white p-3">
                                                            <div className="flex items-center gap-2 border-b border-stone-100 pb-2">
                                                                <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${config.bg} ${config.color}`}>
                                                                    <StatusIcon size={15} />
                                                                </span>
                                                                <div>
                                                                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">営業状況</p>
                                                                    <select
                                                                        value={currentStatus}
                                                                        onChange={(e) => updateStatus(item.id, e.target.value as SalesStatus)}
                                                                        className={`mt-0.5 bg-transparent text-sm font-bold tracking-[0.04em] outline-none ${config.color}`}
                                                                    >
                                                                        {(Object.keys(statusConfig) as SalesStatus[]).map((status) => (
                                                                            <option key={status} value={status}>
                                                                                {statusConfig[status].label}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                            </div>

                                                            <div className="grid grid-cols-2 gap-2 py-3">
                                                                <div>
                                                                    <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">
                                                                        <Trophy size={12} /> 落札者
                                                                    </p>
                                                                    <p className={`mt-1 line-clamp-1 text-xs font-bold ${item.winningContractor ? 'text-emerald-800' : 'text-stone-400'}`}>
                                                                        {item.winningContractor || '未取得'}
                                                                    </p>
                                                                </div>
                                                                <div>
                                                                    <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">
                                                                        <FileText size={12} /> 設計者
                                                                    </p>
                                                                    <p className={`mt-1 line-clamp-1 text-xs font-bold ${item.designFirm ? 'text-sky-800' : 'text-stone-400'}`}>
                                                                        {item.designFirm || '未取得'}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            <div className="grid grid-cols-[1fr_auto] gap-2">
                                                                <Link
                                                                    href={`/project/${item.id}`}
                                                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-950 px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white transition hover:bg-amber-700"
                                                                >
                                                                    詳細
                                                                    <ExternalLink size={13} />
                                                                </Link>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeItem(item.id)}
                                                                    className="inline-flex h-full items-center justify-center rounded-xl border border-red-100 bg-red-50 px-3 text-red-500 transition hover:bg-red-100"
                                                                    title="保存から削除"
                                                                >
                                                                    <Trash2 size={15} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.article>
                                        );
                                    })}
                                </AnimatePresence>
                            </motion.div>
                        )}
                    </div>
                )}
            </div>
        </AppShell>
    );
}

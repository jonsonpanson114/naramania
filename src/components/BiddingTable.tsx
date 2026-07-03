'use client';

import { useMemo, useState } from 'react';
import { BiddingItem, BiddingStatus } from '@/types/bidding';
import { getBiddingLabel } from '@/lib/bidding_schedule';
import { assessBiddingScope, summarizeBiddingScope } from '@/lib/relevance_guard';
import { PRACTICAL_FILTERS, PracticalFilter, countPracticalFilter, matchesPracticalFilter } from '@/lib/practical_filters';
import { AnimatePresence, motion } from 'framer-motion';
import {
    AlertTriangle,
    ArrowUpDown,
    Building2,
    CalendarClock,
    CheckCircle2,
    Eye,
    EyeOff,
    FileText,
    MapPin,
    Search,
    SlidersHorizontal,
    Trophy,
    X,
} from 'lucide-react';

interface BiddingTableProps {
    items: BiddingItem[];
}

type MainFilter = 'すべて' | '新着' | '建築' | '設計' | '落札';
type SubFilter = 'すべて' | 'ゼネコン' | '設計事務所';
type SortMode = 'newest' | 'oldest' | 'biddingSoonest' | 'biddingLatest' | 'municipality';

const MAIN_FILTERS: MainFilter[] = ['すべて', '新着', '建築', '設計', '落札'];
const SUB_FILTERS: SubFilter[] = ['すべて', 'ゼネコン', '設計事務所'];

const STATUS_TONES: Record<BiddingStatus, { label: string; pill: string; dot: string }> = {
    '受付中': { label: '受付中', pill: 'border-sky-200 bg-sky-50 text-sky-700', dot: 'bg-sky-500' },
    '締切': { label: '締切', pill: 'border-stone-200 bg-stone-50 text-stone-600', dot: 'bg-stone-400' },
    '締切間近': { label: '締切間近', pill: 'border-rose-200 bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
    '締切切迫': { label: '締切切迫', pill: 'border-red-200 bg-red-50 text-red-700', dot: 'bg-red-500' },
    '受付終了': { label: '受付終了', pill: 'border-stone-200 bg-stone-50 text-stone-600', dot: 'bg-stone-400' },
    '落札': { label: '落札', pill: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
    '不調': { label: '不調', pill: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
    '不明': { label: '不明', pill: 'border-zinc-200 bg-zinc-50 text-zinc-600', dot: 'bg-zinc-400' },
};

function formatDate(dateStr?: string): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

function isNewItem(dateStr: string): boolean {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return false;
    const diffTime = Math.abs(new Date().getTime() - date.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) <= 7;
}

function biddingDistance(dateStr?: string): { label: string; urgent: boolean; done: boolean } {
    if (!dateStr) return { label: '日程未定', urgent: false, done: false };
    const today = new Date();
    const target = new Date(dateStr);
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (Number.isNaN(diff)) return { label: '日程未定', urgent: false, done: false };
    if (diff < 0) return { label: '終了済み', urgent: false, done: true };
    if (diff === 0) return { label: '本日', urgent: true, done: false };
    if (diff === 1) return { label: '明日', urgent: true, done: false };
    return { label: `${diff}日後`, urgent: diff <= 7, done: false };
}

function sortDate(value?: string, fallback = Number.POSITIVE_INFINITY): number {
    if (!value) return fallback;
    const date = new Date(value).getTime();
    return Number.isNaN(date) ? fallback : date;
}

function StatusPill({ status }: { status: BiddingStatus }) {
    const tone = STATUS_TONES[status] || STATUS_TONES['不明'];
    return (
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold tracking-[0.14em] ${tone.pill}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
            {tone.label}
        </span>
    );
}

export function BiddingTable({ items }: BiddingTableProps) {
    const [mainFilter, setMainFilter] = useState<MainFilter>('すべて');
    const [subFilter, setSubFilter] = useState<SubFilter>('すべて');
    const [selectedTag, setSelectedTag] = useState<string | null>(null);
    const [selectedMunicipality, setSelectedMunicipality] = useState<string | 'すべて'>('すべて');
    const [keyword, setKeyword] = useState('');
    const [sortMode, setSortMode] = useState<SortMode>('newest');
    const [detailedSearch, setDetailedSearch] = useState(false);
    const [hideOutOfScope, setHideOutOfScope] = useState(true);
    const [practicalFilter, setPracticalFilter] = useState<PracticalFilter>('active');

    const scopeById = useMemo(() => new Map(items.map(item => [item.id, assessBiddingScope(item)])), [items]);
    const scopeSummary = useMemo(() => summarizeBiddingScope(items), [items]);
    const visibleItems = useMemo(() => {
        if (!hideOutOfScope) return items;
        return items.filter(item => scopeById.get(item.id)?.status !== 'noise');
    }, [hideOutOfScope, items, scopeById]);

    const municipalities = useMemo(() => Array.from(new Set(visibleItems.map(item => item.municipality))).sort(), [visibleItems]);
    const popularTags = useMemo(() => {
        const counts = visibleItems.flatMap(item => item.tags || []).reduce((acc, tag) => {
            acc[tag] = (acc[tag] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tag]) => tag);
    }, [visibleItems]);

    const filteredItems = useMemo(() => {
        return visibleItems.filter(item => {
            if (keyword.trim()) {
                const kw = keyword.trim().toLowerCase();
                const searchable = [
                    item.title,
                    item.municipality,
                    item.type,
                    item.status,
                    item.winningContractor || '',
                    item.designFirm || '',
                    ...(item.tags || []),
                ].join(' ').toLowerCase();
                const matchesBasic = searchable.includes(kw);
                const matchesDescription = detailedSearch && item.description?.toLowerCase().includes(kw);
                if (!matchesBasic && !matchesDescription) return false;
            }

            if (selectedMunicipality !== 'すべて' && item.municipality !== selectedMunicipality) return false;
            if (selectedTag && !item.tags?.includes(selectedTag)) return false;
            if (!matchesPracticalFilter(item, practicalFilter)) return false;

            if (mainFilter === '新着') return isNewItem(item.announcementDate) || Boolean(item.biddingDate && isNewItem(item.biddingDate));
            if (mainFilter === '建築') return (item.type === '建築' || item.type === '工事') && ['受付中', '締切間近', '締切切迫'].includes(item.status);
            if (mainFilter === '設計') return (item.type === '委託' || item.type === 'コンサル') && ['受付中', '締切間近', '締切切迫'].includes(item.status);
            if (mainFilter === '落札') {
                if (item.status !== '落札') return false;
                return subFilter === 'すべて' || item.winnerType === subFilter;
            }
            return true;
        }).sort((a, b) => {
            const announcementA = sortDate(a.announcementDate, 0);
            const announcementB = sortDate(b.announcementDate, 0);
            const biddingA = sortDate(a.biddingDate);
            const biddingB = sortDate(b.biddingDate);

            if (sortMode === 'biddingSoonest') {
                if (biddingA !== biddingB) return biddingA - biddingB;
                return announcementB - announcementA;
            }
            if (sortMode === 'biddingLatest') {
                const normalizedA = Number.isFinite(biddingA) ? biddingA : Number.NEGATIVE_INFINITY;
                const normalizedB = Number.isFinite(biddingB) ? biddingB : Number.NEGATIVE_INFINITY;
                if (normalizedA !== normalizedB) return normalizedB - normalizedA;
                return announcementB - announcementA;
            }
            if (sortMode === 'municipality') {
                const byMunicipality = a.municipality.localeCompare(b.municipality, 'ja');
                if (byMunicipality !== 0) return byMunicipality;
            }
            return sortMode === 'oldest' ? announcementA - announcementB : announcementB - announcementA;
        });
    }, [detailedSearch, keyword, mainFilter, practicalFilter, selectedMunicipality, selectedTag, sortMode, subFilter, visibleItems]);

    const counts = useMemo(() => ({
        main: {
            'すべて': visibleItems.length,
            '新着': visibleItems.filter(item => isNewItem(item.announcementDate) || Boolean(item.biddingDate && isNewItem(item.biddingDate))).length,
            '建築': visibleItems.filter(item => (item.type === '建築' || item.type === '工事') && ['受付中', '締切間近', '締切切迫'].includes(item.status)).length,
            '設計': visibleItems.filter(item => (item.type === '委託' || item.type === 'コンサル') && ['受付中', '締切間近', '締切切迫'].includes(item.status)).length,
            '落札': visibleItems.filter(item => item.status === '落札').length,
        },
        sub: {
            'すべて': visibleItems.filter(item => item.status === '落札').length,
            'ゼネコン': visibleItems.filter(item => item.status === '落札' && item.winnerType === 'ゼネコン').length,
            '設計事務所': visibleItems.filter(item => item.status === '落札' && item.winnerType === '設計事務所').length,
        },
    }), [visibleItems]);

    const renderSnippet = (text: string, kw: string) => {
        if (!text || !kw) return null;
        const index = text.toLowerCase().indexOf(kw.toLowerCase());
        if (index === -1) return null;
        const start = Math.max(0, index - 45);
        const end = Math.min(text.length, index + kw.length + 45);
        const snippet = text.slice(start, end);
        const escapedKw = kw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(${escapedKw})`, 'gi');
        const parts = snippet.split(regex);

        return (
            <div className="mt-4 rounded-2xl border border-amber-200/70 bg-amber-50/60 p-3 text-xs leading-6 tracking-[0.04em] text-stone-700">
                <span className="mb-1 inline-flex rounded-full bg-amber-200/60 px-2 py-0.5 text-[9px] font-bold tracking-[0.16em] text-amber-800">
                    仕様書・AI要約ヒット
                </span>
                <p>
                    {start > 0 && '...'}
                    {parts.map((part, i) => part.toLowerCase() === kw.toLowerCase()
                        ? <strong key={i} className="rounded bg-amber-200 px-1 text-amber-950">{part}</strong>
                        : part)}
                    {end < text.length && '...'}
                </p>
            </div>
        );
    };

    return (
        <section id="project-board" className="space-y-5 scroll-mt-24" aria-label="案件一覧">
            <div className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-white/80 shadow-sm backdrop-blur-xl">
                <div className="border-b border-stone-200/70 bg-gradient-to-br from-stone-950 via-zinc-900 to-amber-950 px-5 py-6 text-white lg:px-7">
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-amber-200/80">Project Board</p>
                            <h3 className="mt-3 text-2xl font-light tracking-[0.08em] lg:text-3xl">案件を判断する一覧</h3>
                            <p className="mt-3 max-w-3xl text-sm leading-7 tracking-[0.04em] text-stone-200/75">
                                自治体の網羅状況ではなく、案件ごとの日程・状態・落札者を先に読めるように並べ替えました。
                            </p>
                        </div>
                        <div className="grid grid-cols-3 gap-2 rounded-3xl border border-white/10 bg-white/10 p-2 text-center backdrop-blur md:min-w-[360px]">
                            <div className="rounded-2xl bg-white/10 px-3 py-3">
                                <p className="text-[9px] uppercase tracking-[0.2em] text-stone-300">表示</p>
                                <p className="mt-1 text-2xl tabular-nums text-white">{filteredItems.length}</p>
                            </div>
                            <div className="rounded-2xl bg-white/10 px-3 py-3">
                                <p className="text-[9px] uppercase tracking-[0.2em] text-stone-300">対象</p>
                                <p className="mt-1 text-2xl tabular-nums text-emerald-200">{scopeSummary.targetCount}</p>
                            </div>
                            <div className="rounded-2xl bg-white/10 px-3 py-3">
                                <p className="text-[9px] uppercase tracking-[0.2em] text-stone-300">除外候補</p>
                                <p className="mt-1 text-2xl tabular-nums text-rose-200">{scopeSummary.noiseCount}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-5 p-5 lg:p-7">
                    <div className="flex flex-wrap gap-2">
                        {MAIN_FILTERS.map(filter => {
                            const active = mainFilter === filter;
                            return (
                                <button
                                    key={filter}
                                    type="button"
                                    onClick={() => {
                                        setMainFilter(filter);
                                        if (filter !== '落札') setSubFilter('すべて');
                                    }}
                                    className={`rounded-full border px-4 py-2 text-xs font-bold tracking-[0.12em] transition ${active
                                        ? 'border-stone-950 bg-stone-950 text-white shadow-sm'
                                        : 'border-stone-200 bg-white text-stone-500 hover:border-stone-400 hover:text-stone-900'
                                    }`}
                                >
                                    {filter}
                                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] ${active ? 'bg-white/15 text-white' : 'bg-stone-100 text-stone-500'}`}>
                                        {counts.main[filter]}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <AnimatePresence>
                        {mainFilter === '落札' && (
                            <motion.div
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                className="flex flex-wrap gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-2"
                            >
                                {SUB_FILTERS.map(filter => {
                                    const active = subFilter === filter;
                                    return (
                                        <button
                                            key={filter}
                                            type="button"
                                            onClick={() => setSubFilter(filter)}
                                            className={`rounded-full px-3 py-1.5 text-[10px] font-bold tracking-[0.14em] transition ${active
                                                ? 'bg-emerald-700 text-white'
                                                : 'text-emerald-700 hover:bg-white'
                                            }`}
                                        >
                                            {filter} <span className="ml-1 opacity-70">{counts.sub[filter]}</span>
                                        </button>
                                    );
                                })}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_220px]">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                            <input
                                value={keyword}
                                onChange={(e) => setKeyword(e.target.value)}
                                placeholder="案件名、業者名、タグで検索"
                                className="w-full rounded-2xl border border-stone-200 bg-white py-3 pl-11 pr-10 text-sm tracking-[0.04em] text-stone-900 shadow-sm outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                            />
                            {keyword && (
                                <button
                                    type="button"
                                    onClick={() => setKeyword('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
                                    aria-label="検索をクリア"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                        <select
                            value={selectedMunicipality}
                            onChange={(e) => setSelectedMunicipality(e.target.value)}
                            className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-xs font-bold tracking-[0.08em] text-stone-600 shadow-sm outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                        >
                            <option value="すべて">自治体すべて ({municipalities.length})</option>
                            {municipalities.map(municipality => (
                                <option key={municipality} value={municipality}>{municipality}</option>
                            ))}
                        </select>
                        <div className="relative">
                            <ArrowUpDown className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                            <select
                                value={sortMode}
                                onChange={(e) => setSortMode(e.target.value as SortMode)}
                                className="w-full rounded-2xl border border-stone-200 bg-white py-3 pl-11 pr-4 text-xs font-bold tracking-[0.08em] text-stone-600 shadow-sm outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                            >
                                <option value="newest">公告が新しい順</option>
                                <option value="oldest">公告が古い順</option>
                                <option value="biddingSoonest">開札が近い順</option>
                                <option value="biddingLatest">開札が遅い順</option>
                                <option value="municipality">自治体順</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                        <div className="rounded-2xl border border-stone-200 bg-stone-50/80 p-3">
                            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">
                                <SlidersHorizontal size={14} />
                                実務フィルター
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {PRACTICAL_FILTERS.map(filter => {
                                    const active = practicalFilter === filter.id;
                                    const count = countPracticalFilter(visibleItems, filter.id);
                                    return (
                                        <button
                                            key={filter.id}
                                            type="button"
                                            title={filter.description}
                                            onClick={() => setPracticalFilter(filter.id)}
                                            className={`rounded-full border px-3 py-1.5 text-[10px] font-bold tracking-[0.12em] transition ${active
                                                ? 'border-amber-500 bg-amber-400 text-stone-950'
                                                : 'border-stone-200 bg-white text-stone-500 hover:border-amber-300 hover:text-stone-900'
                                            }`}
                                        >
                                            {filter.shortLabel}
                                            <span className={`ml-1.5 rounded-full px-1.5 py-0.5 ${active ? 'bg-stone-950/10' : 'bg-stone-100'}`}>{count}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
                            <button
                                type="button"
                                onClick={() => setHideOutOfScope(!hideOutOfScope)}
                                className={`inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-[10px] font-bold tracking-[0.14em] transition ${hideOutOfScope
                                    ? 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-100'
                                    : 'border-stone-800 bg-stone-900 text-white hover:bg-stone-700'
                                }`}
                            >
                                {hideOutOfScope ? <EyeOff size={14} /> : <Eye size={14} />}
                                {hideOutOfScope ? '対象外候補を非表示' : '対象外候補も表示'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setDetailedSearch(!detailedSearch)}
                                className={`inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-[10px] font-bold tracking-[0.14em] transition ${detailedSearch
                                    ? 'border-amber-300 bg-amber-300 text-stone-950'
                                    : 'border-stone-200 bg-white text-stone-500 hover:text-stone-900'
                                }`}
                            >
                                <FileText size={14} />
                                PDF要約も検索
                            </button>
                        </div>
                    </div>

                    {popularTags.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 border-t border-stone-200 pt-4">
                            <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">タグ</span>
                            {popularTags.map(tag => (
                                <button
                                    key={tag}
                                    type="button"
                                    onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                                    className={`rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] transition ${selectedTag === tag
                                        ? 'border-sky-600 bg-sky-600 text-white'
                                        : 'border-sky-100 bg-sky-50 text-sky-700 hover:border-sky-300'
                                    }`}
                                >
                                    #{tag}
                                </button>
                            ))}
                            {selectedTag && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedTag(null)}
                                    className="ml-auto text-[10px] font-bold tracking-[0.14em] text-rose-600 hover:underline"
                                >
                                    タグ解除
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
                className="grid gap-4"
            >
                <AnimatePresence mode="popLayout">
                    {filteredItems.map((item, index) => {
                        const scope = scopeById.get(item.id) || assessBiddingScope(item);
                        const distance = biddingDistance(item.biddingDate);
                        const isNew = isNewItem(item.announcementDate) || Boolean(item.biddingDate && isNewItem(item.biddingDate));

                        return (
                            <motion.article
                                key={item.id}
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.25, delay: Math.min(index * 0.015, 0.18) }}
                                className="group overflow-hidden rounded-[1.4rem] border border-stone-200/80 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300/70 hover:shadow-md"
                            >
                                <div className="grid gap-0 lg:grid-cols-[150px_minmax(0,1fr)_170px]">
                                    <div className="border-b border-stone-100 bg-stone-50/80 p-4 lg:border-b-0 lg:border-r">
                                        <StatusPill status={item.status} />
                                        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">
                                            <div className="rounded-xl border border-stone-200 bg-white p-2.5">
                                                <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">
                                                    <CalendarClock size={12} /> 公告
                                                </p>
                                                <p className="mt-1 text-base tabular-nums tracking-[0.04em] text-stone-900">{formatDate(item.announcementDate)}</p>
                                            </div>
                                            <div className={`rounded-xl border p-2.5 ${distance.urgent
                                                ? 'border-rose-200 bg-rose-50'
                                                : distance.done
                                                    ? 'border-stone-200 bg-stone-100/70'
                                                    : 'border-amber-200 bg-amber-50/70'
                                            }`}
                                            >
                                                <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-stone-500">
                                                    <CalendarClock size={12} /> {getBiddingLabel(item)}
                                                </p>
                                                <p className={`mt-1 text-base tabular-nums tracking-[0.04em] ${distance.urgent ? 'text-rose-700' : 'text-stone-900'}`}>
                                                    {formatDate(item.biddingDate)}
                                                </p>
                                                <p className={`mt-0.5 text-[10px] font-bold tracking-[0.08em] ${distance.urgent ? 'text-rose-600' : 'text-stone-500'}`}>
                                                    {distance.label}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-4 lg:p-5">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] text-stone-600">
                                                <MapPin size={12} />
                                                {item.municipality}
                                            </span>
                                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] text-amber-700">
                                                <Building2 size={12} />
                                                {item.type}
                                            </span>
                                            {isNew && (
                                                <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-rose-700">
                                                    New
                                                </span>
                                            )}
                                            {scope.status !== 'target' && (
                                                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-[0.1em] ${scope.status === 'noise'
                                                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                                                    : 'border-amber-200 bg-amber-50 text-amber-700'
                                                }`}
                                                >
                                                    {scope.status === 'noise' ? <EyeOff size={12} /> : <AlertTriangle size={12} />}
                                                    {scope.label}: {scope.reasons[0]}
                                                </span>
                                            )}
                                        </div>

                                        <a
                                            href={`/project/${item.id}`}
                                            className="mt-3 block text-lg leading-8 tracking-[0.03em] text-stone-950 transition group-hover:text-amber-700 lg:text-xl"
                                        >
                                            {item.title}
                                        </a>

                                        {(item.estimatedPrice || item.constructionPeriod || item.tags?.length) && (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {item.estimatedPrice && (
                                                    <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-[10px] font-bold tracking-[0.1em] text-stone-700">
                                                        予定価格 {item.estimatedPrice}
                                                    </span>
                                                )}
                                                {item.constructionPeriod && (
                                                    <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-[10px] font-bold tracking-[0.1em] text-stone-700">
                                                        工期 {item.constructionPeriod}
                                                    </span>
                                                )}
                                                {item.tags?.slice(0, 5).map(tag => (
                                                    <span key={tag} className="rounded-full border border-sky-100 bg-sky-50 px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] text-sky-700">
                                                        #{tag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {detailedSearch && keyword && renderSnippet(item.description || '', keyword)}
                                    </div>

                                    <div className="border-t border-stone-100 bg-gradient-to-br from-white to-stone-50 p-4 lg:border-l lg:border-t-0">
                                        <div className="space-y-2.5">
                                            <div className="rounded-xl border border-stone-200 bg-white p-2.5">
                                                <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">
                                                    <Trophy size={12} /> 落札者
                                                </p>
                                                <p className={`mt-1.5 line-clamp-2 text-xs leading-5 tracking-[0.03em] ${item.winningContractor ? 'text-emerald-800' : 'text-stone-400'}`}>
                                                    {item.winningContractor || '未取得'}
                                                </p>
                                            </div>
                                            <div className="rounded-xl border border-stone-200 bg-white p-2.5">
                                                <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">
                                                    <FileText size={12} /> 設計者
                                                </p>
                                                <p className={`mt-1.5 line-clamp-2 text-xs leading-5 tracking-[0.03em] ${item.designFirm ? 'text-sky-800' : 'text-stone-400'}`}>
                                                    {item.designFirm || '未取得'}
                                                </p>
                                            </div>
                                            <a
                                                href={`/project/${item.id}`}
                                                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-stone-950 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white transition hover:bg-amber-700"
                                            >
                                                詳細を見る
                                                <CheckCircle2 size={14} />
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </motion.article>
                        );
                    })}
                </AnimatePresence>

                {filteredItems.length === 0 && (
                    <div className="rounded-[2rem] border border-dashed border-stone-300 bg-white/70 px-6 py-16 text-center">
                        <p className="text-sm tracking-[0.12em] text-stone-400">一致する案件が見つかりませんでした。</p>
                        <button
                            type="button"
                            onClick={() => {
                                setKeyword('');
                                setSelectedMunicipality('すべて');
                                setSelectedTag(null);
                                setPracticalFilter('all');
                                setMainFilter('すべて');
                                setSubFilter('すべて');
                            }}
                            className="mt-5 rounded-full border border-stone-300 bg-white px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-600 transition hover:border-stone-900 hover:text-stone-950"
                        >
                            条件をリセット
                        </button>
                    </div>
                )}
            </motion.div>
        </section>
    );
}

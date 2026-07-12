'use client';

import { useMemo, useState } from 'react';
import { BiddingItem, BiddingStatus } from '@/types/bidding';
import { getBiddingLabel } from '@/lib/bidding_schedule';
import { assessBiddingScope } from '@/lib/relevance_guard';
import { matchesPracticalFilter } from '@/lib/practical_filters';
import {
    ArrowUpDown,
    Building2,
    CalendarClock,
    ChevronDown,
    Download,
    FileText,
    LayoutGrid,
    List,
    MapPin,
    Search,
    SlidersHorizontal,
    Trophy,
    X,
} from 'lucide-react';
import { WatchButton } from '@/components/WatchButton';

export type ViewTab = 'active' | 'followUp' | 'results' | 'all';

interface BiddingTableProps {
    items: BiddingItem[];
    initialTab?: ViewTab;
    initialKeyword?: string;
    initialMunicipality?: string;
}

type WinnerFilter = 'すべて' | 'ゼネコン' | '設計事務所';
type TypeFilter = 'すべて' | '建築' | '設計';
type SortMode = 'newest' | 'oldest' | 'biddingSoonest' | 'biddingLatest' | 'municipality';
type ViewMode = 'compact' | 'card';

const TABS: Array<{ id: ViewTab; label: string; hint: string }> = [
    { id: 'active', label: '受付中', hint: '今すぐ追える案件' },
    { id: 'followUp', label: '追跡待ち', hint: '開札済みで結果未確定' },
    { id: 'results', label: '結果', hint: '落札・不調が確定した案件' },
    { id: 'all', label: 'すべて', hint: '対象案件を全部見る' },
];

const PAGE_SIZE = 20;

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

function matchesTab(item: BiddingItem, tab: ViewTab): boolean {
    if (tab === 'active') return matchesPracticalFilter(item, 'active');
    if (tab === 'followUp') return matchesPracticalFilter(item, 'resultFollowUp');
    if (tab === 'results') return item.status === '落札' || item.status === '不調';
    return true;
}

function matchesType(item: BiddingItem, type: TypeFilter): boolean {
    if (type === 'すべて') return true;
    if (type === '建築') return item.type === '建築' || item.type === '工事';
    return item.type === 'コンサル' || item.type === '委託';
}

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

function exportCsv(items: BiddingItem[]) {
    const headers = ['自治体', '案件名', '種別', 'ステータス', '公告日', '開札日', '落札者', '設計者', '予定価格', '工期', 'リンク'];
    const esc = (value?: string) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = items.map(item => [
        item.municipality,
        item.title,
        item.type,
        item.status,
        item.announcementDate,
        item.biddingDate || '',
        item.winningContractor || '',
        item.designFirm || '',
        item.estimatedPrice || '',
        item.constructionPeriod || '',
        item.link,
    ].map(esc).join(','));

    // BOM付きUTF-8にしないとExcelで文字化けする
    const csv = '﻿' + [headers.map(esc).join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const today = new Date();
    const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    anchor.href = url;
    anchor.download = `naramania_${stamp}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
}

function StatusPill({ status }: { status: BiddingStatus }) {
    const tone = STATUS_TONES[status] || STATUS_TONES['不明'];
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-[0.1em] ${tone.pill}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
            {tone.label}
        </span>
    );
}

export function BiddingTable({ items, initialTab = 'active', initialKeyword = '', initialMunicipality = 'すべて' }: BiddingTableProps) {
    const [tab, setTab] = useState<ViewTab>(initialTab);
    const [winnerFilter, setWinnerFilter] = useState<WinnerFilter>('すべて');
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('すべて');
    const [selectedTag, setSelectedTag] = useState<string | null>(null);
    const [selectedMunicipality, setSelectedMunicipality] = useState<string>(initialMunicipality);
    const [keyword, setKeyword] = useState(initialKeyword);
    const [sortMode, setSortMode] = useState<SortMode>('newest');
    const [detailedSearch, setDetailedSearch] = useState(false);
    const [hideOutOfScope, setHideOutOfScope] = useState(true);
    const [showDetailFilters, setShowDetailFilters] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>('card');
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    const scopeById = useMemo(() => new Map(items.map(item => [item.id, assessBiddingScope(item)])), [items]);
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
            if (!matchesTab(item, tab)) return false;
            if (!matchesType(item, typeFilter)) return false;
            if (tab === 'results' && winnerFilter !== 'すべて' && item.winnerType !== winnerFilter) return false;

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
    }, [detailedSearch, keyword, selectedMunicipality, selectedTag, sortMode, tab, typeFilter, visibleItems, winnerFilter]);

    const tabCounts = useMemo(() => Object.fromEntries(
        TABS.map(({ id }) => [id, visibleItems.filter(item => matchesTab(item, id)).length]),
    ) as Record<ViewTab, number>, [visibleItems]);

    const shownItems = filteredItems.slice(0, visibleCount);
    const remaining = filteredItems.length - shownItems.length;

    const changeFilter = (update: () => void) => {
        update();
        setVisibleCount(PAGE_SIZE);
    };

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
            <div className="mt-3 rounded-2xl border border-amber-200/70 bg-amber-50/60 p-3 text-xs leading-6 tracking-[0.04em] text-stone-700">
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
        <section id="project-board" className="space-y-5 scroll-mt-24 [font-family:'BIZ_UDPGothic','Yu_Gothic','Hiragino_Kaku_Gothic_ProN',sans-serif]" aria-label="案件一覧">
            <div className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-white/80 shadow-sm backdrop-blur-xl">
                <div className="space-y-4 p-5 lg:p-6">
                    {/* メインタブ */}
                    <div className="flex flex-wrap items-center gap-2">
                        {TABS.map(({ id, label, hint }) => {
                            const active = tab === id;
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    title={hint}
                                    onClick={() => changeFilter(() => {
                                        setTab(id);
                                        if (id !== 'results') setWinnerFilter('すべて');
                                    })}
                                    className={`rounded-full border px-4 py-2 text-xs font-bold tracking-[0.12em] transition ${active
                                        ? 'border-stone-950 bg-stone-950 text-white shadow-sm'
                                        : 'border-stone-200 bg-white text-stone-500 hover:border-stone-400 hover:text-stone-900'
                                    }`}
                                >
                                    {label}
                                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] ${active ? 'bg-white/15 text-white' : 'bg-stone-100 text-stone-500'}`}>
                                        {tabCounts[id]}
                                    </span>
                                </button>
                            );
                        })}

                        <div className="ml-auto flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => exportCsv(filteredItems)}
                                title="現在の絞り込み結果をCSVで保存（営業リスト用）"
                                className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-bold tracking-[0.1em] text-stone-500 transition hover:border-emerald-400 hover:text-emerald-700"
                            >
                                <Download size={13} />
                                CSV
                            </button>
                            <div className="flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 p-1">
                                <button
                                    type="button"
                                    onClick={() => setViewMode('compact')}
                                    title="コンパクト表示"
                                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold tracking-[0.1em] transition ${viewMode === 'compact' ? 'bg-stone-950 text-white' : 'text-stone-500 hover:text-stone-900'}`}
                                >
                                    <List size={13} />
                                    リスト
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('card')}
                                    title="カード表示"
                                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold tracking-[0.1em] transition ${viewMode === 'card' ? 'bg-stone-950 text-white' : 'text-stone-500 hover:text-stone-900'}`}
                                >
                                    <LayoutGrid size={13} />
                                    カード
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* 結果タブのときだけ落札者種別 */}
                    {tab === 'results' && (
                        <div className="flex flex-wrap gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-2">
                            {(['すべて', 'ゼネコン', '設計事務所'] as WinnerFilter[]).map(filter => {
                                const active = winnerFilter === filter;
                                return (
                                    <button
                                        key={filter}
                                        type="button"
                                        onClick={() => changeFilter(() => setWinnerFilter(filter))}
                                        className={`rounded-full px-3 py-1.5 text-[10px] font-bold tracking-[0.14em] transition ${active
                                            ? 'bg-emerald-700 text-white'
                                            : 'text-emerald-700 hover:bg-white'
                                        }`}
                                    >
                                        {filter}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* 検索・絞り込み */}
                    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_170px_170px_190px]">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                            <input
                                value={keyword}
                                onChange={(e) => changeFilter(() => setKeyword(e.target.value))}
                                placeholder="案件名、業者名、タグで検索"
                                className="w-full rounded-2xl border border-stone-200 bg-white py-3 pl-11 pr-10 text-sm tracking-[0.04em] text-stone-900 shadow-sm outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                            />
                            {keyword && (
                                <button
                                    type="button"
                                    onClick={() => changeFilter(() => setKeyword(''))}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
                                    aria-label="検索をクリア"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                        <select
                            value={selectedMunicipality}
                            onChange={(e) => changeFilter(() => setSelectedMunicipality(e.target.value))}
                            className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-xs font-bold tracking-[0.08em] text-stone-600 shadow-sm outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                        >
                            <option value="すべて">自治体すべて ({municipalities.length})</option>
                            {municipalities.map(municipality => (
                                <option key={municipality} value={municipality}>{municipality}</option>
                            ))}
                        </select>
                        <select
                            value={typeFilter}
                            onChange={(e) => changeFilter(() => setTypeFilter(e.target.value as TypeFilter))}
                            className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-xs font-bold tracking-[0.08em] text-stone-600 shadow-sm outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                        >
                            <option value="すべて">種別すべて</option>
                            <option value="建築">建築（工事）</option>
                            <option value="設計">設計（コンサル）</option>
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

                    {/* 詳細フィルタ（折りたたみ） */}
                    <div>
                        <button
                            type="button"
                            onClick={() => setShowDetailFilters(!showDetailFilters)}
                            className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-stone-500 transition hover:text-stone-900"
                        >
                            <SlidersHorizontal size={13} />
                            詳細フィルタ
                            <ChevronDown size={13} className={`transition-transform ${showDetailFilters ? 'rotate-180' : ''}`} />
                        </button>

                        {showDetailFilters && (
                            <div className="mt-3 space-y-3 rounded-2xl border border-stone-200 bg-stone-50/80 p-4">
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => changeFilter(() => setHideOutOfScope(!hideOutOfScope))}
                                        className={`rounded-full border px-3 py-1.5 text-[10px] font-bold tracking-[0.12em] transition ${hideOutOfScope
                                            ? 'border-stone-200 bg-white text-stone-500 hover:text-stone-900'
                                            : 'border-stone-800 bg-stone-900 text-white'
                                        }`}
                                    >
                                        {hideOutOfScope ? '対象外候補も表示する' : '対象外候補を表示中'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDetailedSearch(!detailedSearch)}
                                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-bold tracking-[0.12em] transition ${detailedSearch
                                            ? 'border-amber-300 bg-amber-300 text-stone-950'
                                            : 'border-stone-200 bg-white text-stone-500 hover:text-stone-900'
                                        }`}
                                    >
                                        <FileText size={12} />
                                        PDF要約も検索
                                    </button>
                                </div>

                                {popularTags.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-2 border-t border-stone-200 pt-3">
                                        <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">タグ</span>
                                        {popularTags.map(popularTag => (
                                            <button
                                                key={popularTag}
                                                type="button"
                                                onClick={() => changeFilter(() => setSelectedTag(selectedTag === popularTag ? null : popularTag))}
                                                className={`rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] transition ${selectedTag === popularTag
                                                    ? 'border-sky-600 bg-sky-600 text-white'
                                                    : 'border-sky-100 bg-sky-50 text-sky-700 hover:border-sky-300'
                                                }`}
                                            >
                                                #{popularTag}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <p className="text-[11px] tracking-[0.1em] text-stone-400">
                        {filteredItems.length}件中 {shownItems.length}件を表示
                    </p>
                </div>
            </div>

            {/* 一覧 */}
            {viewMode === 'compact' ? (
                <div className="overflow-hidden rounded-[1.5rem] border border-stone-200/90 bg-white shadow-sm">
                    {shownItems.map((item, index) => {
                        const distance = biddingDistance(item.biddingDate);
                        const isNew = isNewItem(item.announcementDate) || Boolean(item.biddingDate && isNewItem(item.biddingDate));

                        return (
                            <a
                                key={item.id}
                                href={`/project/${item.id}`}
                                className={`grid grid-cols-[92px_minmax(0,1fr)_36px] items-center gap-4 px-5 py-5 transition hover:bg-amber-50/60 md:grid-cols-[92px_minmax(0,1fr)_190px_36px] lg:gap-5 ${index > 0 ? 'border-t border-stone-100' : ''}`}
                            >
                                <div className={`rounded-xl px-2 py-2.5 text-center ${distance.urgent
                                    ? 'bg-rose-50'
                                    : distance.done
                                        ? 'bg-stone-50'
                                        : 'bg-amber-50/70'
                                }`}
                                >
                                    <p className={`text-[9px] font-bold tracking-[0.08em] ${distance.urgent ? 'text-rose-600' : 'text-stone-400'}`}>
                                        {distance.label}
                                    </p>
                                    <p className={`text-sm font-bold tabular-nums ${distance.urgent ? 'text-rose-700' : 'text-stone-800'}`}>
                                        {formatDate(item.biddingDate)}
                                    </p>
                                </div>

                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <StatusPill status={item.status} />
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-[0.08em] text-stone-500">
                                            <MapPin size={10} />
                                            {item.municipality}
                                        </span>
                                        <span className="text-[10px] font-bold tracking-[0.08em] text-amber-700">{item.type}</span>
                                        {isNew && (
                                            <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-rose-600">New</span>
                                        )}
                                    </div>
                                    <p className="mt-2 truncate text-[14px] font-bold leading-6 tracking-[0.02em] text-stone-900">
                                        {item.title}
                                    </p>
                                </div>

                                <div className="hidden min-w-0 text-right md:block">
                                    {item.winningContractor ? (
                                        <>
                                            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-stone-400">落札者</p>
                                            <p className="truncate text-xs font-bold text-emerald-800">{item.winningContractor}</p>
                                        </>
                                    ) : item.estimatedPrice ? (
                                        <>
                                            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-stone-400">予定価格</p>
                                            <p className="truncate text-xs font-bold text-stone-700">{item.estimatedPrice}</p>
                                        </>
                                    ) : (
                                        <p className="text-[10px] tracking-[0.1em] text-stone-300">-</p>
                                    )}
                                </div>

                                <WatchButton itemId={item.id} compact />
                            </a>
                        );
                    })}
                </div>
            ) : (
                <div className="grid gap-3">
                    {shownItems.map(item => {
                        const distance = biddingDistance(item.biddingDate);
                        const isNew = isNewItem(item.announcementDate) || Boolean(item.biddingDate && isNewItem(item.biddingDate));
                        const infoBoxes = [
                            item.estimatedPrice ? { label: '予定価格', value: item.estimatedPrice } : null,
                            item.constructionPeriod ? { label: '工期', value: item.constructionPeriod } : null,
                            item.pdfUrl ? { label: '資料', value: 'PDFあり' } : null,
                        ].filter((box): box is { label: string; value: string } => Boolean(box));

                        return (
                            <article
                                key={item.id}
                                className="group overflow-hidden rounded-[1.25rem] border border-stone-200/90 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300/80 hover:shadow-md"
                            >
                                <div className="grid gap-0 lg:grid-cols-[128px_minmax(0,1fr)_238px]">
                                    <div className={`border-b p-4 lg:border-b-0 lg:border-r ${distance.urgent
                                        ? 'border-rose-100 bg-rose-50/80'
                                        : distance.done
                                            ? 'border-stone-100 bg-stone-50'
                                            : 'border-amber-100 bg-amber-50/70'
                                    }`}
                                    >
                                        <p className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] ${distance.urgent
                                            ? 'bg-rose-600 text-white'
                                            : distance.done
                                                ? 'bg-stone-300 text-stone-700'
                                                : 'bg-amber-300 text-stone-950'
                                        }`}
                                        >
                                            {distance.label}
                                        </p>
                                        <p className="mt-3 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-stone-500">
                                            <CalendarClock size={12} /> {getBiddingLabel(item)}
                                        </p>
                                        <p className={`mt-1 text-2xl font-bold tabular-nums tracking-tight ${distance.urgent ? 'text-rose-700' : 'text-stone-950'}`}>
                                            {formatDate(item.biddingDate)}
                                        </p>
                                        <div className="mt-3 rounded-xl border border-white/80 bg-white/70 px-3 py-2">
                                            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">公告</p>
                                            <p className="mt-0.5 text-sm tabular-nums text-stone-700">{formatDate(item.announcementDate)}</p>
                                        </div>
                                    </div>

                                    <div className="p-4 lg:p-5">
                                        <div className="flex flex-wrap items-center gap-2.5">
                                            <StatusPill status={item.status} />
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
                                        </div>

                                        <a
                                            href={`/project/${item.id}`}
                                            className="mt-3 block text-[18px] font-bold leading-8 tracking-[0.02em] text-stone-950 transition group-hover:text-amber-700 lg:text-[20px]"
                                        >
                                            {item.title}
                                        </a>

                                        {infoBoxes.length > 0 && (
                                            <div className="mt-4 grid gap-2 sm:grid-cols-3">
                                                {infoBoxes.map(box => (
                                                    <div key={box.label} className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
                                                        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">{box.label}</p>
                                                        <p className="mt-1 line-clamp-1 text-xs font-bold tracking-[0.04em] text-stone-700">{box.value}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {item.tags && item.tags.length > 0 && (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {item.tags.slice(0, 3).map(tag => (
                                                    <span key={tag} className="rounded-full border border-sky-100 bg-sky-50 px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] text-sky-700">
                                                        #{tag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {detailedSearch && keyword && renderSnippet(item.description || '', keyword)}
                                    </div>

                                    <div className="border-t border-stone-100 bg-gradient-to-br from-stone-50 to-white p-3 lg:border-l lg:border-t-0">
                                        <div className="rounded-xl border border-stone-200 bg-white p-3">
                                            {(item.winningContractor || !['落札', '不調', '受付終了'].includes(item.status)) && (
                                                <div className={item.designFirm ? 'border-b border-stone-100 pb-2' : ''}>
                                                    <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">
                                                        <Trophy size={12} /> 落札者
                                                    </p>
                                                    <p className={`mt-1 line-clamp-1 text-sm font-bold leading-5 tracking-[0.02em] ${item.winningContractor ? 'text-emerald-800' : 'text-stone-400'}`}>
                                                        {item.winningContractor || '開札前'}
                                                    </p>
                                                </div>
                                            )}
                                            {item.designFirm && (
                                                <div className="pt-2">
                                                    <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">
                                                        <FileText size={12} /> 設計者
                                                    </p>
                                                    <p className="mt-1 line-clamp-1 text-sm font-bold leading-5 tracking-[0.02em] text-sky-800">
                                                        {item.designFirm}
                                                    </p>
                                                </div>
                                            )}
                                            <a
                                                href={`/project/${item.id}`}
                                                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-stone-950 px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white transition hover:bg-amber-700"
                                            >
                                                詳細を見る
                                            </a>
                                            <div className="mt-2">
                                                <WatchButton itemId={item.id} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}

            {remaining > 0 && (
                <div className="text-center">
                    <button
                        type="button"
                        onClick={() => setVisibleCount(visibleCount + 50)}
                        className="rounded-full border border-stone-300 bg-white px-6 py-3 text-xs font-bold tracking-[0.14em] text-stone-600 shadow-sm transition hover:border-stone-900 hover:text-stone-950"
                    >
                        さらに表示（残り {remaining} 件）
                    </button>
                </div>
            )}

            {filteredItems.length === 0 && (
                <div className="rounded-[2rem] border border-dashed border-stone-300 bg-white/70 px-6 py-16 text-center">
                    <p className="text-sm tracking-[0.12em] text-stone-400">一致する案件が見つかりませんでした。</p>
                    <button
                        type="button"
                        onClick={() => changeFilter(() => {
                            setKeyword('');
                            setSelectedMunicipality('すべて');
                            setSelectedTag(null);
                            setTab('all');
                            setTypeFilter('すべて');
                            setWinnerFilter('すべて');
                        })}
                        className="mt-5 rounded-full border border-stone-300 bg-white px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-600 transition hover:border-stone-900 hover:text-stone-950"
                    >
                        条件をリセット
                    </button>
                </div>
            )}
        </section>
    );
}

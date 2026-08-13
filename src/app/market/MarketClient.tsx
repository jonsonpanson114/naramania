'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
    ArrowUpDown,
    Building2,
    ChevronDown,
    Download,
    ExternalLink,
    MapPin,
    Search,
    Trophy,
    Users,
    X,
} from 'lucide-react';

/** /market で扱う軽量アイテム（description等の重いフィールドは落としてある） */
export type MarketRow = {
    id: string;
    municipality: string;
    title: string;
    type: string;
    announcementDate: string;
    biddingDate?: string;
    link: string;
    status: string;
    winningContractor?: string;
    designFirm?: string;
    winnerType?: string;
    estimatedPrice?: string;
    isRelevant: boolean;
};

type Tab = 'contractors' | 'all';
type WinnerTypeFilter = 'すべて' | '設計事務所' | 'ゼネコン';
type ScopeFilter = 'すべて' | '対象のみ' | '対象外のみ';

const PAGE_SIZE = 30;

function formatDate(dateStr?: string): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' });
}

function parsePrice(priceStr?: string): number | null {
    if (!priceStr) return null;
    const yenMatch = priceStr.match(/([0-9][0-9,]*)\s*円/);
    const target = yenMatch ? yenMatch[1] : (priceStr.match(/[0-9][0-9,]*/)?.[0] ?? '');
    const num = parseInt(target.replace(/,/g, ''), 10);
    return Number.isFinite(num) && num > 0 ? num : null;
}

function formatCurrency(val: number): string {
    if (val >= 100000000) return `${(val / 100000000).toFixed(1)}億円`;
    if (val >= 10000) return `${Math.round(val / 10000).toLocaleString()}万円`;
    return `${val.toLocaleString()}円`;
}

function exportCsv(rows: MarketRow[]) {
    const headers = ['自治体', '案件名', '種別', 'ステータス', '公告日', '開札日', '落札者', '落札者種別', '予定価格', '掲載対象', 'リンク'];
    const esc = (value?: string) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const body = rows.map(row => [
        row.municipality,
        row.title,
        row.type,
        row.status,
        row.announcementDate,
        row.biddingDate || '',
        row.winningContractor || '',
        row.winnerType || '',
        row.estimatedPrice || '',
        row.isRelevant ? '対象' : '対象外',
        row.link,
    ].map(esc).join(','));

    const csv = '﻿' + [headers.map(esc).join(','), ...body].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const today = new Date();
    const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    anchor.href = url;
    anchor.download = `naramania_market_${stamp}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
}

export function MarketClient({ items }: { items: MarketRow[] }) {
    const [tab, setTab] = useState<Tab>('contractors');

    // --- 業者別 ---
    const [winnerTypeFilter, setWinnerTypeFilter] = useState<WinnerTypeFilter>('設計事務所');
    const [contractorKeyword, setContractorKeyword] = useState('');
    const [expanded, setExpanded] = useState<string | null>(null);
    const [contractorLimit, setContractorLimit] = useState(PAGE_SIZE);

    // --- 全件一覧 ---
    const [keyword, setKeyword] = useState('');
    const [municipality, setMunicipality] = useState('すべて');
    const [scope, setScope] = useState<ScopeFilter>('すべて');
    const [sortMode, setSortMode] = useState<'newest' | 'oldest'>('newest');
    const [listLimit, setListLimit] = useState(PAGE_SIZE);

    const municipalities = useMemo(
        () => Array.from(new Set(items.map(item => item.municipality))).sort(),
        [items],
    );

    const contractorStats = useMemo(() => {
        const map = new Map<string, {
            name: string;
            winnerType: string;
            items: MarketRow[];
            municipalities: Set<string>;
            totalAmount: number;
        }>();

        for (const item of items) {
            const name = item.winningContractor?.trim();
            if (!name) continue;
            const entry = map.get(name) || {
                name,
                winnerType: item.winnerType || 'その他',
                items: [],
                municipalities: new Set<string>(),
                totalAmount: 0,
            };
            entry.items.push(item);
            entry.municipalities.add(item.municipality);
            entry.totalAmount += parsePrice(item.estimatedPrice) ?? 0;
            // 種別は案件ごとにぶれるので、設計事務所判定が一度でも出たらそちらを優先する
            if (item.winnerType === '設計事務所') entry.winnerType = '設計事務所';
            map.set(name, entry);
        }

        return Array.from(map.values())
            .map(entry => ({
                ...entry,
                count: entry.items.length,
                relevantCount: entry.items.filter(i => i.isRelevant).length,
                municipalityCount: entry.municipalities.size,
                latestDate: entry.items
                    .map(i => i.announcementDate)
                    .filter(Boolean)
                    .sort()
                    .reverse()[0] || '',
            }))
            .sort((a, b) => b.count - a.count || b.totalAmount - a.totalAmount);
    }, [items]);

    const filteredContractors = useMemo(() => {
        const kw = contractorKeyword.trim().toLowerCase();
        return contractorStats.filter(entry => {
            if (winnerTypeFilter !== 'すべて' && entry.winnerType !== winnerTypeFilter) return false;
            if (kw && !entry.name.toLowerCase().includes(kw)) return false;
            return true;
        });
    }, [contractorStats, contractorKeyword, winnerTypeFilter]);

    const filteredItems = useMemo(() => {
        const kw = keyword.trim().toLowerCase();
        return items.filter(item => {
            if (kw) {
                const searchable = [
                    item.title,
                    item.municipality,
                    item.winningContractor || '',
                    item.designFirm || '',
                ].join(' ').toLowerCase();
                if (!searchable.includes(kw)) return false;
            }
            if (municipality !== 'すべて' && item.municipality !== municipality) return false;
            if (scope === '対象のみ' && !item.isRelevant) return false;
            if (scope === '対象外のみ' && item.isRelevant) return false;
            return true;
        }).sort((a, b) => sortMode === 'newest'
            ? (b.announcementDate || '').localeCompare(a.announcementDate || '')
            : (a.announcementDate || '').localeCompare(b.announcementDate || ''));
    }, [items, keyword, municipality, scope, sortMode]);

    const relevantCount = useMemo(() => items.filter(i => i.isRelevant).length, [items]);
    const withWinnerCount = useMemo(() => items.filter(i => i.winningContractor).length, [items]);

    const shownContractors = filteredContractors.slice(0, contractorLimit);
    const shownItems = filteredItems.slice(0, listLimit);

    return (
        <div className="space-y-6">
            {/* サマリ */}
            <div className="grid gap-2 sm:grid-cols-4">
                <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">全案件</p>
                    <p className="mt-1 text-2xl tabular-nums text-stone-900">{items.length}</p>
                </div>
                <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">うち掲載対象</p>
                    <p className="mt-1 text-2xl tabular-nums text-emerald-700">{relevantCount}</p>
                </div>
                <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">落札者判明</p>
                    <p className="mt-1 text-2xl tabular-nums text-sky-700">{withWinnerCount}</p>
                </div>
                <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">業者数</p>
                    <p className="mt-1 text-2xl tabular-nums text-amber-700">{contractorStats.length}</p>
                </div>
            </div>

            {/* タブ */}
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => setTab('contractors')}
                    className={`rounded-full border px-4 py-2 text-xs font-bold tracking-[0.12em] transition ${tab === 'contractors'
                        ? 'border-stone-950 bg-stone-950 text-white shadow-sm'
                        : 'border-stone-200 bg-white text-stone-500 hover:border-stone-400 hover:text-stone-900'
                    }`}
                >
                    <span className="inline-flex items-center gap-1.5"><Users size={13} /> 業者別</span>
                </button>
                <button
                    type="button"
                    onClick={() => setTab('all')}
                    className={`rounded-full border px-4 py-2 text-xs font-bold tracking-[0.12em] transition ${tab === 'all'
                        ? 'border-stone-950 bg-stone-950 text-white shadow-sm'
                        : 'border-stone-200 bg-white text-stone-500 hover:border-stone-400 hover:text-stone-900'
                    }`}
                >
                    <span className="inline-flex items-center gap-1.5"><Building2 size={13} /> 全件一覧</span>
                </button>

                <button
                    type="button"
                    onClick={() => exportCsv(tab === 'all' ? filteredItems : filteredContractors.flatMap(c => c.items))}
                    title="現在の絞り込み結果をCSVで保存"
                    className="ml-auto flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-2 text-[10px] font-bold tracking-[0.1em] text-stone-500 transition hover:border-emerald-400 hover:text-emerald-700"
                >
                    <Download size={13} />
                    CSV
                </button>
            </div>

            {tab === 'contractors' ? (
                <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                            <input
                                value={contractorKeyword}
                                onChange={(e) => { setContractorKeyword(e.target.value); setContractorLimit(PAGE_SIZE); }}
                                placeholder="業者名で検索"
                                className="w-full rounded-2xl border border-stone-200 bg-white py-3 pl-11 pr-10 text-sm text-stone-900 shadow-sm outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                            />
                            {contractorKeyword && (
                                <button
                                    type="button"
                                    onClick={() => setContractorKeyword('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-stone-400 transition hover:bg-stone-100"
                                    aria-label="検索をクリア"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                        <div className="flex gap-2">
                            {(['設計事務所', 'ゼネコン', 'すべて'] as WinnerTypeFilter[]).map(filter => (
                                <button
                                    key={filter}
                                    type="button"
                                    onClick={() => { setWinnerTypeFilter(filter); setContractorLimit(PAGE_SIZE); }}
                                    className={`rounded-full border px-3 py-2 text-[10px] font-bold tracking-[0.1em] transition ${winnerTypeFilter === filter
                                        ? 'border-amber-500 bg-amber-400 text-stone-950'
                                        : 'border-stone-200 bg-white text-stone-500 hover:border-amber-300'
                                    }`}
                                >
                                    {filter}
                                </button>
                            ))}
                        </div>
                    </div>

                    <p className="text-[11px] tracking-[0.1em] text-stone-400">
                        {filteredContractors.length}社中 {shownContractors.length}社を表示
                    </p>

                    <div className="overflow-hidden rounded-[1.5rem] border border-stone-200/90 bg-white shadow-sm">
                        {shownContractors.map((entry, index) => {
                            const isOpen = expanded === entry.name;
                            return (
                                <div key={entry.name} className={index > 0 ? 'border-t border-stone-100' : ''}>
                                    <button
                                        type="button"
                                        onClick={() => setExpanded(isOpen ? null : entry.name)}
                                        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 text-left transition hover:bg-amber-50/60"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.1em] ${entry.winnerType === '設計事務所'
                                                    ? 'bg-sky-50 text-sky-700'
                                                    : 'bg-stone-100 text-stone-600'
                                                }`}
                                                >
                                                    {entry.winnerType}
                                                </span>
                                                <span className="text-[10px] tracking-[0.08em] text-stone-400">
                                                    {entry.municipalityCount}自治体 / 直近 {formatDate(entry.latestDate)}
                                                </span>
                                            </div>
                                            <p className="mt-1.5 truncate text-[15px] font-bold text-stone-900">{entry.name}</p>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-stone-400">受注</p>
                                                <p className="text-lg font-bold tabular-nums text-stone-900">{entry.count}<span className="ml-0.5 text-xs font-normal text-stone-400">件</span></p>
                                            </div>
                                            {entry.totalAmount > 0 && (
                                                <div className="hidden text-right sm:block">
                                                    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-stone-400">判明額</p>
                                                    <p className="text-sm font-bold tabular-nums text-emerald-800">{formatCurrency(entry.totalAmount)}</p>
                                                </div>
                                            )}
                                            <ChevronDown size={16} className={`shrink-0 text-stone-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                        </div>
                                    </button>

                                    {isOpen && (
                                        <div className="border-t border-stone-100 bg-stone-50/60 px-5 py-4">
                                            <div className="space-y-2">
                                                {entry.items
                                                    .slice()
                                                    .sort((a, b) => (b.announcementDate || '').localeCompare(a.announcementDate || ''))
                                                    .map(item => (
                                                        <div key={item.id} className="rounded-xl border border-stone-200 bg-white px-4 py-3">
                                                            <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold tracking-[0.1em]">
                                                                <span className="inline-flex items-center gap-1 text-stone-500">
                                                                    <MapPin size={10} />
                                                                    {item.municipality}
                                                                </span>
                                                                <span className="tabular-nums text-stone-400">{formatDate(item.announcementDate)}</span>
                                                                <span className="text-amber-700">{item.type}</span>
                                                                {!item.isRelevant && (
                                                                    <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[9px] text-stone-500">掲載対象外</span>
                                                                )}
                                                                {item.estimatedPrice && (
                                                                    <span className="text-emerald-700">{item.estimatedPrice}</span>
                                                                )}
                                                            </div>
                                                            <div className="mt-1.5 flex items-start justify-between gap-3">
                                                                {item.isRelevant ? (
                                                                    <Link href={`/project/${item.id}`} className="text-[13px] font-bold leading-6 text-stone-900 transition hover:text-amber-700">
                                                                        {item.title}
                                                                    </Link>
                                                                ) : (
                                                                    <p className="text-[13px] font-bold leading-6 text-stone-800">{item.title}</p>
                                                                )}
                                                                {item.link && (
                                                                    <a
                                                                        href={item.link}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        className="mt-0.5 shrink-0 text-stone-400 transition hover:text-amber-700"
                                                                        aria-label="元ページを開く"
                                                                    >
                                                                        <ExternalLink size={13} />
                                                                    </a>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {shownContractors.length === 0 && (
                            <p className="px-6 py-16 text-center text-sm tracking-[0.12em] text-stone-400">
                                該当する業者が見つかりませんでした。
                            </p>
                        )}
                    </div>

                    {filteredContractors.length > shownContractors.length && (
                        <div className="text-center">
                            <button
                                type="button"
                                onClick={() => setContractorLimit(contractorLimit + 50)}
                                className="rounded-full border border-stone-300 bg-white px-6 py-3 text-xs font-bold tracking-[0.14em] text-stone-600 shadow-sm transition hover:border-stone-900 hover:text-stone-950"
                            >
                                さらに表示（残り {filteredContractors.length - shownContractors.length} 社）
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_170px_170px_190px]">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                            <input
                                value={keyword}
                                onChange={(e) => { setKeyword(e.target.value); setListLimit(PAGE_SIZE); }}
                                placeholder="案件名、業者名で検索"
                                className="w-full rounded-2xl border border-stone-200 bg-white py-3 pl-11 pr-10 text-sm text-stone-900 shadow-sm outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                            />
                            {keyword && (
                                <button
                                    type="button"
                                    onClick={() => setKeyword('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-stone-400 transition hover:bg-stone-100"
                                    aria-label="検索をクリア"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                        <select
                            value={municipality}
                            onChange={(e) => { setMunicipality(e.target.value); setListLimit(PAGE_SIZE); }}
                            className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-xs font-bold tracking-[0.08em] text-stone-600 shadow-sm outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                        >
                            <option value="すべて">自治体すべて ({municipalities.length})</option>
                            {municipalities.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <select
                            value={scope}
                            onChange={(e) => { setScope(e.target.value as ScopeFilter); setListLimit(PAGE_SIZE); }}
                            className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-xs font-bold tracking-[0.08em] text-stone-600 shadow-sm outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                        >
                            <option value="すべて">対象・対象外すべて</option>
                            <option value="対象のみ">掲載対象のみ</option>
                            <option value="対象外のみ">掲載対象外のみ</option>
                        </select>
                        <div className="relative">
                            <ArrowUpDown className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                            <select
                                value={sortMode}
                                onChange={(e) => setSortMode(e.target.value as 'newest' | 'oldest')}
                                className="w-full rounded-2xl border border-stone-200 bg-white py-3 pl-11 pr-4 text-xs font-bold tracking-[0.08em] text-stone-600 shadow-sm outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                            >
                                <option value="newest">公告が新しい順</option>
                                <option value="oldest">公告が古い順</option>
                            </select>
                        </div>
                    </div>

                    <p className="text-[11px] tracking-[0.1em] text-stone-400">
                        {filteredItems.length}件中 {shownItems.length}件を表示
                    </p>

                    <div className="overflow-hidden rounded-[1.5rem] border border-stone-200/90 bg-white shadow-sm">
                        {shownItems.map((item, index) => (
                            <div
                                key={item.id}
                                className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 ${index > 0 ? 'border-t border-stone-100' : ''}`}
                            >
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold tracking-[0.1em]">
                                        <span className="inline-flex items-center gap-1 text-stone-500">
                                            <MapPin size={10} />
                                            {item.municipality}
                                        </span>
                                        <span className="tabular-nums text-stone-400">{formatDate(item.announcementDate)}</span>
                                        <span className="text-amber-700">{item.type}</span>
                                        <span className="text-stone-500">{item.status}</span>
                                        {item.isRelevant ? (
                                            <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] text-emerald-700">掲載対象</span>
                                        ) : (
                                            <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[9px] text-stone-500">対象外</span>
                                        )}
                                    </div>
                                    <div className="mt-1.5 flex items-start gap-2">
                                        {item.isRelevant ? (
                                            <Link href={`/project/${item.id}`} className="truncate text-[14px] font-bold leading-6 text-stone-900 transition hover:text-amber-700">
                                                {item.title}
                                            </Link>
                                        ) : (
                                            <p className="truncate text-[14px] font-bold leading-6 text-stone-800">{item.title}</p>
                                        )}
                                        {item.link && (
                                            <a
                                                href={item.link}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="mt-0.5 shrink-0 text-stone-400 transition hover:text-amber-700"
                                                aria-label="元ページを開く"
                                            >
                                                <ExternalLink size={13} />
                                            </a>
                                        )}
                                    </div>
                                </div>
                                <div className="hidden min-w-0 text-right sm:block">
                                    {item.winningContractor ? (
                                        <>
                                            <p className="flex items-center justify-end gap-1 text-[9px] font-bold uppercase tracking-[0.14em] text-stone-400">
                                                <Trophy size={10} /> 落札者
                                            </p>
                                            <p className="max-w-[200px] truncate text-xs font-bold text-emerald-800">{item.winningContractor}</p>
                                        </>
                                    ) : (
                                        <p className="text-[10px] tracking-[0.1em] text-stone-300">-</p>
                                    )}
                                </div>
                            </div>
                        ))}

                        {shownItems.length === 0 && (
                            <p className="px-6 py-16 text-center text-sm tracking-[0.12em] text-stone-400">
                                一致する案件が見つかりませんでした。
                            </p>
                        )}
                    </div>

                    {filteredItems.length > shownItems.length && (
                        <div className="text-center">
                            <button
                                type="button"
                                onClick={() => setListLimit(listLimit + 50)}
                                className="rounded-full border border-stone-300 bg-white px-6 py-3 text-xs font-bold tracking-[0.14em] text-stone-600 shadow-sm transition hover:border-stone-900 hover:text-stone-950"
                            >
                                さらに表示（残り {filteredItems.length - shownItems.length} 件）
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

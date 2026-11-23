'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, CalendarClock, ExternalLink, Pin, Search, Sparkles, X } from 'lucide-react';
import type { FirmProfile } from '@/lib/firms_directory';
import { usePinnedFirms } from '@/lib/pinned_firms';
import { estimateDesignTiming, evaluateSalesFit } from '@/lib/sales_fit';

interface FirmsDirectoryClientProps {
    firms: FirmProfile[];
    initialFirmKey?: string;
}

function formatDate(dateStr?: string): string {
    if (!dateStr) return '-';
    const m = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return dateStr;
    return `${m[1]}/${Number(m[2])}/${Number(m[3])}`;
}

export function FirmsDirectoryClient({ firms, initialFirmKey }: FirmsDirectoryClientProps) {
    const { pinnedKeys, isPinned, toggle } = usePinnedFirms();
    const [keyword, setKeyword] = useState('');
    const [onlyPinned, setOnlyPinned] = useState(false);
    const [onlyOsaka, setOnlyOsaka] = useState(false);
    const [onlyTarget, setOnlyTarget] = useState(false);
    const [selectedKey, setSelectedKey] = useState<string>(initialFirmKey ?? firms[0]?.key ?? '');

    const filtered = useMemo(() => {
        const q = keyword.trim().normalize('NFKC').toLowerCase();
        const pinnedSet = new Set(pinnedKeys);

        return firms
            .filter(firm => {
                if (onlyPinned && !pinnedSet.has(firm.key)) return false;
                if (onlyOsaka && firm.osakaCount === 0) return false;
                if (onlyTarget && firm.targetCount === 0) return false;
                if (!q) return true;
                if (firm.name.normalize('NFKC').toLowerCase().includes(q)) return true;
                return firm.entries.some(e =>
                    e.title.normalize('NFKC').toLowerCase().includes(q)
                    || e.source.normalize('NFKC').toLowerCase().includes(q),
                );
            })
            .sort((a, b) => {
                const aPinned = pinnedSet.has(a.key) ? 1 : 0;
                const bPinned = pinnedSet.has(b.key) ? 1 : 0;
                if (bPinned !== aPinned) return bPinned - aPinned;
                if (b.latestDate !== a.latestDate) return (b.latestDate || '').localeCompare(a.latestDate || '');
                return b.naraCount - a.naraCount;
            });
    }, [firms, keyword, onlyPinned, onlyOsaka, onlyTarget, pinnedKeys]);

    const activeFirm = useMemo(() => {
        return filtered.find(f => f.key === selectedKey) ?? filtered[0] ?? null;
    }, [filtered, selectedKey]);

    const osakaTotalFirms = firms.filter(f => f.osakaCount > 0).length;
    const targetTotalFirms = firms.filter(f => f.targetCount > 0).length;

    return (
        <div className="space-y-4">
            {/* 検索・絞り込みバー */}
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200 bg-white/90 p-3">
                <div className="relative min-w-[14rem] flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                    <input
                        type="text"
                        value={keyword}
                        onChange={e => setKeyword(e.target.value)}
                        placeholder="設計事務所名・案件名・自治体で検索"
                        className="h-9 w-full rounded-lg border border-stone-300 bg-white pl-9 pr-8 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:outline-none"
                    />
                    {keyword && (
                        <button
                            type="button"
                            onClick={() => setKeyword('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                            aria-label="検索をクリア"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => setOnlyPinned(v => !v)}
                    aria-pressed={onlyPinned}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-bold transition ${
                        onlyPinned
                            ? 'border-amber-500 bg-amber-100 text-amber-900'
                            : 'border-stone-300 bg-white text-stone-700 hover:border-amber-400'
                    }`}
                >
                    <Pin size={13} />
                    ピン留め（{pinnedKeys.length}）
                </button>
                <button
                    type="button"
                    onClick={() => setOnlyOsaka(v => !v)}
                    aria-pressed={onlyOsaka}
                    className={`h-9 rounded-lg border px-3 text-[13px] font-bold transition ${
                        onlyOsaka
                            ? 'border-sky-500 bg-sky-100 text-sky-900'
                            : 'border-stone-300 bg-white text-stone-700 hover:border-sky-400'
                    }`}
                >
                    大阪受注あり（{osakaTotalFirms}）
                </button>
                <button
                    type="button"
                    onClick={() => setOnlyTarget(v => !v)}
                    aria-pressed={onlyTarget}
                    className={`inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-[13px] font-bold transition ${
                        onlyTarget
                            ? 'border-rose-500 bg-rose-100 text-rose-900'
                            : 'border-stone-300 bg-white text-stone-700 hover:border-rose-400'
                    }`}
                >
                    <Sparkles size={13} />
                    内装・建具狙い目（{targetTotalFirms}）
                </button>
            </div>

            {filtered.length === 0 ? (
                <div className="rounded-2xl border border-stone-200 bg-white/80 py-12 text-center text-sm text-stone-500">
                    条件に一致する設計事務所はありません。
                </div>
            ) : (
                <div className="grid gap-4 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
                    {/* 左ペイン：設計事務所一覧 */}
                    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white/90">
                        <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50/80 px-4 py-2.5 text-xs font-bold text-stone-600">
                            <span>設計事務所（{filtered.length}社）</span>
                            <span>ピン留めでトップ優先表示</span>
                        </div>
                        <ul className="max-h-[70vh] divide-y divide-stone-200 overflow-y-auto">
                            {filtered.map(firm => {
                                const pinned = isPinned(firm.key);
                                const selected = activeFirm?.key === firm.key;
                                return (
                                    <li
                                        key={firm.key}
                                        className={`flex items-start justify-between gap-2 px-3 py-2.5 transition ${
                                            selected ? 'bg-amber-50/90' : 'hover:bg-stone-50'
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => setSelectedKey(firm.key)}
                                            className="min-w-0 flex-1 text-left"
                                        >
                                            <p className={`truncate text-sm font-bold ${selected ? 'text-amber-950' : 'text-stone-900'}`}>
                                                {firm.name}
                                            </p>
                                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                                                <span className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-700">
                                                    奈良 {firm.naraCount}
                                                </span>
                                                {firm.osakaCount > 0 && (
                                                    <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-800">
                                                        大阪 {firm.osakaCount}
                                                    </span>
                                                )}
                                                {firm.targetCount > 0 && (
                                                    <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700">
                                                        狙い目 {firm.targetCount}
                                                    </span>
                                                )}
                                                <span className="text-stone-400 tabular-nums">
                                                    最新 {formatDate(firm.latestDate)}
                                                </span>
                                            </div>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => toggle(firm.key)}
                                            aria-pressed={pinned}
                                            title={pinned ? 'ピン留めを外す' : 'よく行く事務所としてピン留め'}
                                            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition ${
                                                pinned
                                                    ? 'border-amber-400 bg-amber-100 text-amber-800'
                                                    : 'border-stone-200 bg-white text-stone-400 hover:border-amber-300 hover:text-amber-700'
                                            }`}
                                        >
                                            <Pin size={13} fill={pinned ? 'currentColor' : 'none'} />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>

                    {/* 右ペイン：選択中の設計事務所カルテ */}
                    {activeFirm && (
                        <section className="rounded-2xl border border-stone-200 bg-white/95 p-4 sm:p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 pb-4">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <Building2 size={18} className="text-amber-700" />
                                        <h2 className="text-lg font-bold text-stone-900">{activeFirm.name}</h2>
                                    </div>
                                    <p className="mt-1 text-xs text-stone-600">
                                        奈良の案件 {activeFirm.naraCount}件 ／ 大阪での受注 {activeFirm.osakaCount}件 ／ 狙い目案件 {activeFirm.targetCount}件
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => toggle(activeFirm.key)}
                                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                                        isPinned(activeFirm.key)
                                            ? 'border-amber-500 bg-amber-100 text-amber-900'
                                            : 'border-stone-300 bg-white text-stone-700 hover:border-amber-400'
                                    }`}
                                >
                                    <Pin size={13} fill={isPinned(activeFirm.key) ? 'currentColor' : 'none'} />
                                    {isPinned(activeFirm.key) ? 'ピン留め中（トップ優先）' : 'よく行く事務所にピン留め'}
                                </button>
                            </div>

                            <ul className="mt-3 divide-y divide-stone-200">
                                {activeFirm.entries.map(entry => {
                                    const fit = evaluateSalesFit(entry.title);
                                    const timing = estimateDesignTiming(entry.title, entry.date, entry.type);
                                    return (
                                        <li key={entry.id} className="py-3.5 first:pt-1 last:pb-1">
                                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                                <span className="font-semibold text-stone-500 tabular-nums">
                                                    {formatDate(entry.date)}
                                                </span>
                                                <span className={`rounded px-1.5 py-0.5 font-bold ${
                                                    entry.area === '大阪'
                                                        ? 'bg-sky-100 text-sky-900'
                                                        : entry.area === 'ニュース'
                                                            ? 'bg-purple-100 text-purple-900'
                                                            : 'bg-stone-100 text-stone-800'
                                                }`}>
                                                    {entry.source}
                                                </span>
                                                <span className={`rounded border px-1.5 py-0.5 text-[11px] font-bold ${fit.badgeClass}`}>
                                                    {fit.label}
                                                </span>
                                                {entry.status && (
                                                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold text-emerald-800">
                                                        {entry.status}
                                                    </span>
                                                )}
                                                {entry.amount && (
                                                    <span className="text-stone-600 tabular-nums">{entry.amount}</span>
                                                )}
                                            </div>

                                            <div className="mt-1.5">
                                                {entry.external ? (
                                                    <a
                                                        href={entry.href}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-start gap-1 text-[15px] font-semibold leading-6 text-stone-900 hover:text-amber-700 hover:underline"
                                                    >
                                                        <span>{entry.title}</span>
                                                        <ExternalLink size={13} className="mt-1.5 shrink-0 text-stone-400" />
                                                    </a>
                                                ) : (
                                                    <Link
                                                        href={entry.href}
                                                        className="text-[15px] font-semibold leading-6 text-stone-900 hover:text-amber-700 hover:underline"
                                                    >
                                                        {entry.title}
                                                    </Link>
                                                )}
                                            </div>

                                            {timing && (
                                                <div className={`mt-2 flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                                                    timing.isNowHot
                                                        ? 'border-amber-300 bg-amber-50 text-amber-950'
                                                        : 'border-stone-200 bg-stone-50 text-stone-600'
                                                }`}>
                                                    <CalendarClock size={13} className={timing.isNowHot ? 'text-amber-700' : 'text-stone-400'} />
                                                    <span className="font-bold">
                                                        {timing.isNowHot ? '今が提案どき' : timing.stageNote}
                                                    </span>
                                                    <span>仕様提案目安：{timing.proposalWindow}</span>
                                                    {timing.constructionWindow && (
                                                        <span className="text-stone-500">／ 本体工事目安：{timing.constructionWindow}</span>
                                                    )}
                                                </div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    )}
                </div>
            )}
        </div>
    );
}

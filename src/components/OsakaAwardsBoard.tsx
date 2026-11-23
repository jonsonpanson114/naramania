'use client';

import { useMemo, useState } from 'react';
import { CalendarClock, ExternalLink, Search, Sparkles, X } from 'lucide-react';
import type { OsakaAwardRecord, OsakaSourceName, OsakaSourceSummary } from '@/lib/osaka_awards_store';
import { estimateDesignTiming, evaluateSalesFit } from '@/lib/sales_fit';

interface OsakaAwardsBoardProps {
    records: OsakaAwardRecord[];
    summaries: OsakaSourceSummary[];
    generatedAt: string | null;
    initialScope?: 'nara' | 'all';
}

function formatDate(dateStr?: string): string {
    if (!dateStr) return '-';
    const m = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return dateStr;
    return `${m[1]}/${Number(m[2])}/${Number(m[3])}`;
}

export function OsakaAwardsBoard({
    records,
    summaries,
    generatedAt,
    initialScope = 'nara',
}: OsakaAwardsBoardProps) {
    const [scope, setScope] = useState<'nara' | 'all'>(initialScope);
    const [sourceFilter, setSourceFilter] = useState<'all' | OsakaSourceName>('all');
    const [onlyTarget, setOnlyTarget] = useState(false);
    const [keyword, setKeyword] = useState('');
    const [visibleCount, setVisibleCount] = useState(40);

    const naraCount = useMemo(() => records.filter(r => r.isNaraFirm).length, [records]);

    const filtered = useMemo(() => {
        const q = keyword.trim().normalize('NFKC').toLowerCase();
        return records.filter(item => {
            if (scope === 'nara' && !item.isNaraFirm) return false;
            if (sourceFilter !== 'all' && item.source !== sourceFilter) return false;
            if (onlyTarget && !evaluateSalesFit(item.title, item.kind).isTarget) return false;
            if (!q) return true;
            const hay = `${item.title} ${item.winner ?? ''} ${item.address ?? ''} ${item.location ?? ''} ${item.source} ${item.kind}`
                .normalize('NFKC')
                .toLowerCase();
            return hay.includes(q);
        });
    }, [records, scope, sourceFilter, onlyTarget, keyword]);

    const shown = filtered.slice(0, visibleCount);
    const remaining = filtered.length - shown.length;

    return (
        <section className="mt-4 space-y-4">
            {/* 3自治体の収集ステータス */}
            <div className="grid gap-3 md:grid-cols-3">
                {summaries.map(summary => (
                    <div
                        key={summary.source}
                        className="rounded-xl border border-stone-200 bg-white/90 p-3.5"
                    >
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-stone-900">{summary.source}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                                summary.naraHitCount > 0 ? 'bg-sky-100 text-sky-900' : 'bg-stone-100 text-stone-600'
                            }`}>
                                奈良ヒット {summary.naraHitCount}件
                            </span>
                        </div>
                        <p className="mt-1 text-xs text-stone-500 tabular-nums">
                            確認 {summary.checkedCount}件（落札決定 {summary.decidedCount}件）
                        </p>
                    </div>
                ))}
            </div>

            {/* 切り替え＆絞り込みバー */}
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200 bg-white/90 p-3">
                <div className="inline-flex rounded-lg border border-stone-300 bg-stone-50 p-0.5">
                    <button
                        type="button"
                        onClick={() => { setScope('nara'); setVisibleCount(40); }}
                        className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
                            scope === 'nara' ? 'bg-sky-700 text-white' : 'text-stone-700 hover:bg-white'
                        }`}
                    >
                        奈良の設計事務所のみ（{naraCount}）
                    </button>
                    <button
                        type="button"
                        onClick={() => { setScope('all'); setVisibleCount(40); }}
                        className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
                            scope === 'all' ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-white'
                        }`}
                    >
                        大阪の全設計結果（{records.length}）
                    </button>
                </div>

                <select
                    value={sourceFilter}
                    onChange={e => { setSourceFilter(e.target.value as 'all' | OsakaSourceName); setVisibleCount(40); }}
                    aria-label="自治体で絞り込む"
                    className="h-9 rounded-lg border border-stone-300 bg-white px-2.5 text-xs font-bold text-stone-700"
                >
                    <option value="all">大阪府・大阪市・堺市すべて</option>
                    <option value="大阪府">大阪府</option>
                    <option value="大阪市">大阪市</option>
                    <option value="堺市">堺市</option>
                </select>

                <button
                    type="button"
                    onClick={() => { setOnlyTarget(v => !v); setVisibleCount(40); }}
                    aria-pressed={onlyTarget}
                    className={`inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-xs font-bold transition ${
                        onlyTarget
                            ? 'border-rose-500 bg-rose-100 text-rose-900'
                            : 'border-stone-300 bg-white text-stone-700 hover:border-rose-400'
                    }`}
                >
                    <Sparkles size={13} />
                    内装・建具狙い目のみ
                </button>

                <div className="relative min-w-[13rem] flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                    <input
                        type="text"
                        value={keyword}
                        onChange={e => { setKeyword(e.target.value); setVisibleCount(40); }}
                        placeholder="案件名・設計事務所名・住所で検索"
                        className="h-9 w-full rounded-lg border border-stone-300 bg-white pl-9 pr-8 text-xs text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:outline-none"
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
            </div>

            <p className="text-xs text-stone-500">
                表示中：{filtered.length}件{generatedAt ? `（最終巡回 ${new Date(generatedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}）` : ''}
            </p>

            {shown.length === 0 ? (
                <div className="rounded-xl border border-stone-200 bg-white/80 py-10 text-center text-sm text-stone-500">
                    該当する大阪の設計入札結果はありません。
                </div>
            ) : (
                <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
                    {shown.map(item => {
                        const fit = evaluateSalesFit(item.title, item.kind);
                        const timing = estimateDesignTiming(item.title, item.openDate, '設計');
                        return (
                            <li key={item.key} className="px-4 py-3 hover:bg-amber-50/40">
                                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                    <span className="font-semibold text-stone-500 tabular-nums">{formatDate(item.openDate)}</span>
                                    <span className="rounded bg-sky-100 px-1.5 py-0.5 font-bold text-sky-900">{item.source}</span>
                                    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-700">{item.kind}</span>
                                    <span className={`rounded border px-1.5 py-0.5 text-[11px] font-bold ${fit.badgeClass}`}>
                                        {fit.shortLabel}
                                    </span>
                                    {item.isNaraFirm && (
                                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-900">
                                            奈良の事務所
                                        </span>
                                    )}
                                </div>

                                <div className="mt-1">
                                    <a
                                        href={item.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-start gap-1 text-[15px] font-semibold leading-6 text-stone-900 hover:text-amber-700 hover:underline"
                                    >
                                        <span>{item.title}</span>
                                        <ExternalLink size={13} className="mt-1.5 shrink-0 text-stone-400" />
                                    </a>
                                </div>

                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                                    <span className="font-bold text-emerald-800">
                                        落札：{item.winner || '未確定 / 確認中'}
                                    </span>
                                    {item.amount && <span className="text-stone-600 tabular-nums">{item.amount}</span>}
                                    {item.address && <span className="text-stone-500">{item.address}</span>}
                                </div>

                                {timing && (
                                    <p className={`mt-1.5 inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-semibold ${
                                        timing.isNowHot ? 'bg-amber-50 text-amber-900' : 'bg-stone-50 text-stone-600'
                                    }`}>
                                        <CalendarClock size={12} />
                                        {timing.isNowHot ? '今が提案どき · ' : ''}仕様提案目安：{timing.proposalWindow}
                                        {timing.constructionWindow ? `（本体工事 ${timing.constructionWindow}）` : ''}
                                    </p>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {remaining > 0 && (
                <div className="text-center">
                    <button
                        type="button"
                        onClick={() => setVisibleCount(c => c + 40)}
                        className="rounded-lg border border-stone-300 bg-white px-5 py-2 text-xs font-bold text-stone-700 hover:border-amber-400 hover:text-amber-900"
                    >
                        もっと見る（残り {remaining}件）
                    </button>
                </div>
            )}
        </section>
    );
}

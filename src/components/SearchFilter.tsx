'use client';

import { motion } from 'framer-motion';
import { Search, MapPin, Filter, SlidersHorizontal } from 'lucide-react';
import { PRACTICAL_FILTERS, PracticalFilter } from '@/lib/practical_filters';

interface SearchFilterProps {
    keyword: string;
    onKeywordChange: (value: string) => void;
    municipalities: string[];
    municipality: string;
    onMunicipalityChange: (value: string) => void;
    status: string;
    onStatusChange: (value: string) => void;
    quickFilter: PracticalFilter;
    onQuickFilterChange: (value: PracticalFilter) => void;
    quickCounts: Record<PracticalFilter, number>;
    resultCount: number;
}

const statuses = ['すべて', '受付中', '締切間近', '落札', '受付終了'];

export function SearchFilter({
    keyword,
    onKeywordChange,
    municipalities,
    municipality,
    onMunicipalityChange,
    status,
    onStatusChange,
    quickFilter,
    onQuickFilterChange,
    quickCounts,
    resultCount,
}: SearchFilterProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-12"
        >
            <div className="bg-white/80 backdrop-blur-xl shadow-premium p-8 rounded-lg border border-white/50">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Keyword Search */}
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary/40" />
                        <input
                            type="text"
                            placeholder="キーワード検索（工事名、業者名...）"
                            value={keyword}
                            onChange={(e) => onKeywordChange(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 border border-border/30 rounded-md bg-white/50 text-sm tracking-wider font-serif focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all placeholder:text-secondary/30"
                        />
                    </div>

                    {/* Municipality Filter */}
                    <div className="relative">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary/40" />
                        <select
                            value={municipality}
                            onChange={(e) => onMunicipalityChange(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 border border-border/30 rounded-md bg-white/50 text-sm tracking-wider font-serif focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all appearance-none cursor-pointer"
                        >
                            {['すべて', ...municipalities].map((m) => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>

                    {/* Status Filter */}
                    <div className="relative">
                        <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary/40" />
                        <select
                            value={status}
                            onChange={(e) => onStatusChange(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 border border-border/30 rounded-md bg-white/50 text-sm tracking-wider font-serif focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all appearance-none cursor-pointer"
                        >
                            {statuses.map((s) => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="mt-6 rounded-xl border border-slate-200/70 bg-slate-950 p-4 text-white">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-amber-200">
                                <SlidersHorizontal size={16} />
                            </div>
                            <div>
                                <p className="text-xs font-bold tracking-[0.16em]">実務クイックフィルター</p>
                                <p className="mt-1 text-[11px] leading-5 text-slate-300">開札後確認・学校トイレ改修・受付中だけを素早く切り替えます。</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {PRACTICAL_FILTERS.map(filter => {
                                const active = quickFilter === filter.id;
                                return (
                                    <button
                                        key={filter.id}
                                        type="button"
                                        title={filter.description}
                                        onClick={() => onQuickFilterChange(filter.id)}
                                        className={`rounded-full border px-3 py-1.5 text-[10px] font-bold tracking-[0.12em] transition ${
                                            active
                                                ? 'border-amber-200 bg-amber-200 text-slate-950'
                                                : 'border-white/15 bg-white/5 text-slate-300 hover:border-white/30 hover:bg-white/10'
                                        }`}
                                    >
                                        {filter.shortLabel}
                                        <span className={`ml-1.5 rounded-full px-1.5 py-0.5 ${active ? 'bg-slate-950/10' : 'bg-white/10'}`}>
                                            {quickCounts[filter.id] || 0}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Result Count */}
                <div className="mt-6 flex items-center justify-between">
                    <p className="text-[10px] tracking-[0.3em] text-secondary/50 uppercase font-serif">
                        検索結果: <span className="text-accent font-bold text-sm">{resultCount}</span> 件
                    </p>
                    <button
                        onClick={() => {
                            onKeywordChange('');
                            onMunicipalityChange('すべて');
                            onStatusChange('すべて');
                            onQuickFilterChange('all');
                        }}
                        className="text-[10px] tracking-[0.2em] text-secondary/40 hover:text-accent transition-colors uppercase cursor-pointer"
                    >
                        フィルターをリセット
                    </button>
                </div>
            </div>
        </motion.div>
    );
}

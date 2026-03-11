'use client';

import { useState } from 'react';
import { BiddingItem } from '@/types/bidding';
import { motion, AnimatePresence } from 'framer-motion';

interface BiddingTableProps {
    items: BiddingItem[];
}

type MainFilter = 'すべて' | '建築' | '設計' | '落札';
type SubFilter = 'すべて' | 'ゼネコン' | '設計事務所';

export function BiddingTable({ items }: BiddingTableProps) {
    const [mainFilter, setMainFilter] = useState<MainFilter>('すべて');
    const [subFilter, setSubFilter] = useState<SubFilter>('すべて');
    const [selectedTag, setSelectedTag] = useState<string | null>(null);

    // Get popular tags from all items
    const allTags = items.flatMap(i => i.tags || []);
    const tagCounts = allTags.reduce((acc, tag) => {
        acc[tag] = (acc[tag] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    const popularTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tag]) => tag);

    // Filter logic
    const filteredItems = items.filter(item => {
        // Tag filter takes priority if active
        if (selectedTag && !item.tags?.includes(selectedTag)) return false;

        if (mainFilter === 'すべて') return true;

        // Construction (建築) -> Shows currently open construction items
        if (mainFilter === '建築') {
            const isConstructionType = item.type === '建築' || item.type === '工事';
            const isActiveStatus = item.status === '受付中' || item.status === '締切間近';
            return isConstructionType && isActiveStatus;
        }

        // Design (設計) -> Shows currently open consulting/design items
        if (mainFilter === '設計') {
            const isDesignType = item.type === '委託' || item.type === 'コンサル';
            const isActiveStatus = item.status === '受付中' || item.status === '締切間近';
            return isDesignType && isActiveStatus;
        }

        if (mainFilter === '落札') {
            if (item.status !== '落札') return false;
            if (subFilter === 'すべて') return true;
            return item.winnerType === subFilter;
        }
        return true;
    });

    // Count per tab
    const counts = {
        main: {
            'すべて': items.length,
            '建築': items.filter(i => (i.type === '建築' || i.type === '工事') && (i.status === '受付中' || i.status === '締切間近')).length,
            '設計': items.filter(i => (i.type === '委託' || i.type === 'コンサル') && (i.status === '受付中' || i.status === '締切間近')).length,
            '落札': items.filter(i => i.status === '落札').length,
        },
        sub: {
            'すべて': items.filter(i => i.status === '落札').length,
            'ゼネコン': items.filter(i => i.status === '落札' && i.winnerType === 'ゼネコン').length,
            '設計事務所': items.filter(i => i.status === '落札' && i.winnerType === '設計事務所').length,
        }
    };

    // Format date utility
    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return `${d.getMonth() + 1}/${d.getDate()}`;
    };

    return (
        <div className="space-y-4">
            {/* Main Filters */}
            <div className="flex justify-center">
                <div className="flex items-center gap-8 border-b border-border/40 pb-4 px-4">
                    {(['すべて', '建築', '設計', '落札'] as MainFilter[]).map((filter) => (
                        <button
                            key={filter}
                            onClick={() => {
                                setMainFilter(filter);
                                if (filter !== '落札') setSubFilter('すべて');
                            }}
                            className={`text-[10px] tracking-[0.25em] relative font-bold font-serif transition-all duration-300 uppercase flex items-center gap-2 ${mainFilter === filter
                                ? filter === '落札' ? 'text-green-600'
                                    : filter === '建築' ? 'text-indigo-600'
                                        : filter === '設計' ? 'text-amber-600'
                                            : 'text-primary'
                                : 'text-gray-400 hover:text-primary'
                                }`}
                        >
                            {filter}
                            <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-sans ${mainFilter === filter
                                ? filter === '落札' ? 'bg-green-100 text-green-700'
                                    : filter === '建築' ? 'bg-indigo-100 text-indigo-700'
                                        : filter === '設計' ? 'bg-amber-100 text-amber-700'
                                            : 'bg-primary/10 text-primary'
                                : 'bg-gray-100 text-gray-400'
                                }`}>
                                {counts.main[filter]}
                            </span>
                            {mainFilter === filter && (
                                <motion.span
                                    layoutId="mainFilterDot"
                                    className={`absolute -bottom-[17px] left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${filter === '落札' ? 'bg-green-500' : filter === '建築' ? 'bg-indigo-500' : filter === '設計' ? 'bg-amber-500' : 'bg-accent'
                                        }`}
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                ></motion.span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Sub Filters (Only for Awarded) */}
            <AnimatePresence>
                {mainFilter === '落札' && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex justify-center pt-2 pb-6"
                    >
                        <div className="flex items-center gap-4 bg-gray-50/50 p-1 rounded-full border border-gray-100 backdrop-blur-sm">
                            {(['すべて', 'ゼネコン', '設計事務所'] as SubFilter[]).map((filter) => (
                                <button
                                    key={filter}
                                    onClick={() => setSubFilter(filter)}
                                    className={`px-4 py-1.5 rounded-full text-[9px] font-bold tracking-wider transition-all duration-300 flex items-center gap-2 ${subFilter === filter
                                        ? filter === 'ゼネコン' ? 'bg-indigo-600 text-white shadow-md'
                                            : filter === '設計事務所' ? 'bg-amber-600 text-white shadow-md'
                                                : 'bg-emerald-600 text-white shadow-md'
                                        : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                >
                                    {filter}
                                    <span className={`text-[8px] px-1.5 py-0.5 rounded-full ${subFilter === filter ? 'bg-white/20' : 'bg-gray-200/50'}`}>
                                        {counts.sub[filter]}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Tag Filter */}
            <div className="flex flex-wrap justify-center gap-2 py-4 px-8 max-w-4xl mx-auto">
                <button
                    onClick={() => setSelectedTag(null)}
                    className={`px-3 py-1 rounded-full text-[9px] font-bold tracking-wider transition-all border ${!selectedTag ? 'bg-primary text-white border-primary shadow-sm' : 'bg-transparent text-secondary border-border/40 hover:border-primary/40'}`}
                >
                    ALL TAGS
                </button>
                {popularTags.map(tag => (
                    <button
                        key={tag}
                        onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                        className={`px-3 py-1 rounded-full text-[9px] font-bold tracking-wider transition-all border ${selectedTag === tag ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-blue-50/30 text-blue-600/70 border-blue-100 hover:border-blue-400'}`}
                    >
                        #{tag}
                    </button>
                ))}
            </div>


            {/* Table Container */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="bg-white/80 backdrop-blur-xl shadow-premium p-1 rounded-lg border border-white/50"
            >
                <div className="overflow-hidden rounded-md border border-border/20">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-secondary/60 text-[10px] tracking-[0.3em] border-b border-border/40 font-serif uppercase bg-sidebar/30">
                                <th className="px-8 py-6 font-normal w-24">Status</th>
                                <th className="px-8 py-6 font-normal w-32">Region</th>
                                <th className="px-8 py-6 font-normal">Project / Result Details</th>
                                <th className="px-8 py-6 font-normal w-32">Type</th>
                                <th className="px-8 py-6 font-normal w-32">Date</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/10">
                            <AnimatePresence mode="popLayout">
                                {filteredItems.map((item, index) => (
                                    <motion.tr
                                        key={item.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 10 }}
                                        transition={{ duration: 0.4, delay: index * 0.01 }}
                                        className="hover:bg-accent/5 transition-colors duration-300 group cursor-pointer"
                                    >
                                        <td className="px-8 py-6">
                                            <div className="flex flex-col gap-1.5">
                                                <span className={`text-[9px] tracking-[0.2em] border px-2.5 py-1 rounded-sm uppercase font-bold text-center ${item.status === '落札' ? 'text-green-600 border-green-200 bg-green-50' :
                                                    item.status === '受付中' ? 'text-secondary border-secondary/20 bg-secondary/5' :
                                                        item.status === '締切間近' ? 'text-accent border-accent/30 bg-accent/5' :
                                                            'text-gray-300 border-gray-100'
                                                    }`}>
                                                    {item.status}
                                                </span>
                                                {item.winnerType && item.status === '落札' && (
                                                    <span className={`text-[8px] text-center px-1 py-0.5 rounded-sm font-bold border ${item.winnerType === 'ゼネコン' ? 'text-indigo-600 border-indigo-100 bg-indigo-50' :
                                                        item.winnerType === '設計事務所' ? 'text-amber-600 border-amber-100 bg-amber-50' :
                                                            'text-gray-400 border-gray-100 bg-gray-50'
                                                        }`}>
                                                        {item.winnerType}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-xs text-secondary font-serif font-bold tracking-wider">{item.municipality}</td>
                                        <td className="px-8 py-6">
                                            <div className="flex flex-col gap-1">
                                                <a href={`/project/${item.id}`} className="text-[15px] text-primary tracking-wide group-hover:text-accent transition-colors duration-300 font-serif block truncate max-w-xl leading-relaxed">
                                                    {item.title}
                                                </a>

                                                {/* Price & Period tags */}
                                                {(item.estimatedPrice || item.constructionPeriod) && (
                                                    <div className="flex gap-3 mt-1 text-[11px] font-sans tracking-wide text-secondary/80">
                                                        {item.estimatedPrice && (
                                                            <span className="flex items-center gap-1.5 bg-accent/5 px-2 py-0.5 rounded border border-accent/20 text-accent-dark font-medium">
                                                                <span className="opacity-70">💰</span> {item.estimatedPrice}
                                                            </span>
                                                        )}
                                                        {item.constructionPeriod && (
                                                            <span className="flex items-center gap-1.5 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
                                                                <span className="opacity-70">📅</span> {item.constructionPeriod}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Tags */}
                                                {item.tags && item.tags.length > 0 && (
                                                    <div className="flex gap-2 mt-1.5 flex-wrap">
                                                        {item.tags.map(tag => (
                                                            <span key={tag} className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100 font-bold tracking-wider">
                                                                #{tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Winners */}
                                                {(item.winningContractor || item.designFirm) && (
                                                    <div className="flex gap-3 mt-1.5 text-[10px] font-sans tracking-wider uppercase">
                                                        {item.winningContractor && (
                                                            <span className="text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-sm">
                                                                <span className="opacity-50 mr-1">🏆</span> {item.winningContractor}
                                                            </span>
                                                        )}
                                                        {item.designFirm && (
                                                            <span className="text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-sm">
                                                                <span className="opacity-50 mr-1">📐</span> {item.designFirm}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-[10px] text-gray-400 tracking-[0.2em] font-serif uppercase">{item.type}</td>
                                        <td className="px-8 py-6 text-[11px] text-gray-400 font-serif tabular-nums tracking-widest">{formatDate(item.announcementDate)}</td>
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                            {filteredItems.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-8 py-20 text-center text-secondary/40 font-serif italic tracking-widest text-sm">
                                        No matching records found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </motion.div>
        </div>
    );
}

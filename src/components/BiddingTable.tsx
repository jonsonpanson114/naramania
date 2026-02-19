'use client';

import { useState } from 'react';
import { BiddingItem } from '@/types/bidding';
import { motion, AnimatePresence } from 'framer-motion';

interface BiddingTableProps {
    items: BiddingItem[];
}

type FilterType = 'すべて' | '落札' | '締切間近' | '測量・コンサル' | '業務委託' | '建築';

export function BiddingTable({ items }: BiddingTableProps) {
    const [activeFilter, setActiveFilter] = useState<FilterType>('すべて');

    // Filter logic
    const filteredItems = items.filter(item => {
        if (activeFilter === 'すべて') return true;
        if (activeFilter === '落札') return item.status === '落札';
        if (activeFilter === '締切間近') return item.status === '締切間近';
        if (activeFilter === '測量・コンサル') return item.type === 'コンサル';
        if (activeFilter === '業務委託') return item.type === '委託';
        if (activeFilter === '建築') return item.type === '建築' || item.type === '工事';
        return true;
    });

    // Count per tab
    const counts: Record<FilterType, number> = {
        'すべて': items.length,
        '落札': items.filter(i => i.status === '落札').length,
        '締切間近': items.filter(i => i.status === '締切間近').length,
        '測量・コンサル': items.filter(i => i.type === 'コンサル').length,
        '業務委託': items.filter(i => i.type === '委託').length,
        '建築': items.filter(i => i.type === '建築' || i.type === '工事').length,
    };


    // Format date utility
    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return `${d.getMonth() + 1}月${d.getDate()}日`;
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-center">
                <div className="flex items-center gap-10 border-b border-border/40 pb-6 px-12">
                    {(['すべて', '落札', '締切間近', '測量・コンサル', '業務委託', '建築'] as FilterType[]).map((filter) => (
                        <button
                            key={filter}
                            onClick={() => setActiveFilter(filter)}
                            className={`text-[10px] tracking-[0.3em] relative font-bold font-serif transition-all duration-300 uppercase flex items-center gap-1.5 ${activeFilter === filter
                                    ? filter === '落札' ? 'text-green-600'
                                        : filter === '締切間近' ? 'text-amber-600'
                                            : 'text-primary'
                                    : 'text-gray-400 hover:text-primary'
                                }`}
                        >
                            {filter}
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-sans ${activeFilter === filter
                                    ? filter === '落札' ? 'bg-green-100 text-green-700'
                                        : filter === '締切間近' ? 'bg-amber-100 text-amber-700'
                                            : 'bg-primary/10 text-primary'
                                    : 'bg-gray-100 text-gray-400'
                                }`}>
                                {counts[filter]}
                            </span>
                            {activeFilter === filter && (
                                <motion.span
                                    layoutId="activeFilterDot"
                                    className={`absolute -bottom-[25px] left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${filter === '落札' ? 'bg-green-500' : filter === '締切間近' ? 'bg-amber-500' : 'bg-accent'
                                        } shadow-[0_0_10px_rgba(var(--accent-rgb),0.5)]`}
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                ></motion.span>
                            )}
                        </button>
                    ))}
                </div>
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
                                        transition={{ duration: 0.4, delay: index * 0.02 }}
                                        className="hover:bg-accent/5 transition-colors duration-300 group cursor-pointer"
                                    >
                                        <td className="px-8 py-6">
                                            <span className={`text-[9px] tracking-[0.2em] border px-2.5 py-1 rounded-sm uppercase font-bold ${item.status === '落札' ? 'text-green-600 border-green-200 bg-green-50' :
                                                item.status === '受付中' ? 'text-secondary border-secondary/20 bg-secondary/5' :
                                                    item.status === '締切間近' ? 'text-accent border-accent/30 bg-accent/5' :
                                                        'text-gray-300 border-gray-100'
                                                }`}>
                                                {item.status}
                                            </span>
                                        </td>
                                        <td className="px-8 py-6 text-xs text-secondary font-serif font-bold tracking-wider">{item.municipality}</td>
                                        <td className="px-8 py-6">
                                            <div className="flex flex-col gap-1">
                                                <a href={`/project/${item.id}`} className="text-[15px] text-primary tracking-wide group-hover:text-accent transition-colors duration-300 font-serif block truncate max-w-xl leading-relaxed">
                                                    {item.title}
                                                </a>
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

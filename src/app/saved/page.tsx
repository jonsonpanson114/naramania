'use client';

import { useState } from 'react';
import { BiddingItem } from '@/types/bidding';
import { AppShell } from '@/components/AppShell';
import { Header } from '@/components/Header';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, Trash2, ExternalLink, Briefcase, Award, AlertTriangle, Layers, Send, TrendingUp } from 'lucide-react';
import Link from 'next/link';

type SalesStatus = 'pending' | 'active' | 'negotiating' | 'won' | 'lost';

interface SavedBiddingItem extends BiddingItem {
    salesStatus?: SalesStatus;
}

const statusConfig: Record<SalesStatus, { label: string; color: string; bg: string; border: string; icon: any }> = {
    pending: { label: 'アプローチ前', color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200', icon: Layers },
    active: { label: '元請け営業中', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', icon: Send },
    negotiating: { label: '見積提示中', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', icon: TrendingUp },
    won: { label: '受注確定！', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', icon: Award },
    lost: { label: '失注', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', icon: AlertTriangle }
};

export default function SavedPage() {
    const [savedItems, setSavedItems] = useState<SavedBiddingItem[]>(() => {
        if (typeof window === 'undefined') {
            return [];
        }
        const stored = localStorage.getItem('naramania_saved');
        if (stored) {
            try {
                const items = JSON.parse(stored) as SavedBiddingItem[];
                // Ensure all items have a default status of 'pending'
                return items.map(item => ({
                    ...item,
                    salesStatus: item.salesStatus || 'pending'
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
            item.id === id ? { ...item, salesStatus: newStatus } : item
        );
        setSavedItems(updated);
        localStorage.setItem('naramania_saved', JSON.stringify(updated));
    };

    const removeItem = (id: string) => {
        const updated = savedItems.filter(item => item.id !== id);
        setSavedItems(updated);
        localStorage.setItem('naramania_saved', JSON.stringify(updated));
    };

    // Group counts
    const getCount = (status: SalesStatus) => {
        return savedItems.filter(item => item.salesStatus === status).length;
    };

    const filteredItems = activeTab === 'all'
        ? savedItems
        : savedItems.filter(item => item.salesStatus === activeTab);

    return (
        <AppShell>
            <Header />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
            >
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
                    <div>
                        <h2 className="text-3xl tracking-widest mb-4 font-serif">お気に入り・営業管理</h2>
                        <p className="text-secondary/60 text-sm tracking-wider">
                            下請けメーカーとしての各案件への営業ステータスを一元管理できます。
                        </p>
                    </div>
                    {savedItems.length > 0 && (
                        <div className="bg-accent/5 border border-accent/20 px-4 py-2 rounded-md flex items-center gap-3">
                            <Briefcase className="w-4 h-4 text-accent" />
                            <span className="text-xs text-accent tracking-wider font-semibold">
                                受注確定: {getCount('won')} 件 / 全 {savedItems.length} 件
                            </span>
                        </div>
                    )}
                </div>
            </motion.div>

            {savedItems.length === 0 ? (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-white/80 backdrop-blur-xl shadow-premium p-16 rounded-lg border border-white/50 text-center"
                >
                    <Bookmark className="w-12 h-12 text-secondary/20 mx-auto mb-6" />
                    <p className="text-secondary/40 tracking-wider text-sm mb-2">お気に入り登録された案件はありません</p>
                    <p className="text-secondary/30 tracking-wider text-xs">
                        案件検索やダッシュボードから、自社商材が使えそうな案件を保存してください。
                    </p>
                    <Link href="/search" className="inline-block mt-8 bg-accent text-white text-sm tracking-wider px-6 py-2.5 rounded-md hover:bg-accent/90 transition-all shadow-md">
                        案件を探す
                    </Link>
                </motion.div>
            ) : (
                <div className="space-y-8">
                    {/* Status Tabs */}
                    <div className="flex flex-wrap gap-2 border-b border-border/30 pb-4">
                        <button
                            onClick={() => setActiveTab('all')}
                            className={`px-4 py-2.5 rounded-md text-xs tracking-wider font-semibold transition-all cursor-pointer border ${
                                activeTab === 'all'
                                    ? 'bg-secondary text-white border-secondary'
                                    : 'bg-white/50 text-secondary/60 border-border/20 hover:border-secondary/20'
                            }`}
                        >
                            すべて ({savedItems.length})
                        </button>
                        {(Object.keys(statusConfig) as SalesStatus[]).map((status) => {
                            const config = statusConfig[status];
                            const Icon = config.icon;
                            const isActive = activeTab === status;
                            return (
                                <button
                                    key={status}
                                    onClick={() => setActiveTab(status)}
                                    className={`px-4 py-2.5 rounded-md text-xs tracking-wider font-semibold transition-all cursor-pointer border flex items-center gap-2 ${
                                        isActive
                                            ? `${config.bg} ${config.color} ${config.border} font-bold shadow-sm`
                                            : 'bg-white/50 text-secondary/60 border-border/20 hover:border-secondary/20'
                                    }`}
                                >
                                    <Icon size={14} />
                                    {config.label} ({getCount(status)})
                                </button>
                            );
                        })}
                    </div>

                    {/* Kanban/List View */}
                    <div className="space-y-4">
                        {filteredItems.length === 0 ? (
                            <div className="bg-white/40 p-12 text-center rounded-lg border border-dashed border-border/30">
                                <p className="text-secondary/40 text-sm tracking-wider">このステータスの案件はありません</p>
                            </div>
                        ) : (
                            <AnimatePresence mode="popLayout">
                                {filteredItems.map((item, index) => {
                                    const currentStatus = item.salesStatus || 'pending';
                                    const config = statusConfig[currentStatus];
                                    return (
                                        <motion.div
                                            key={item.id}
                                            layout
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            transition={{ duration: 0.3 }}
                                            className="bg-white/80 backdrop-blur-xl shadow-premium p-6 rounded-lg border border-white/50 flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:border-accent/20 transition-all"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-3 mb-2 flex-wrap">
                                                    <span className={`text-[8px] tracking-[0.2em] border px-2 py-0.5 rounded-sm uppercase font-bold ${
                                                        item.status === '落札' ? 'text-green-600 border-green-200 bg-green-50' :
                                                        item.status === '受付中' ? 'text-secondary border-secondary/20 bg-secondary/5' :
                                                        'text-amber-600 border-amber-200 bg-amber-50'
                                                    }`}>
                                                        {item.status}
                                                    </span>
                                                    <span className="text-[10px] text-secondary/40 tracking-wider">{item.municipality}</span>
                                                    {item.estimatedPrice && (
                                                        <span className="text-[9px] text-accent/80 border border-accent/10 bg-accent/5 px-2 py-0.5 rounded-sm tracking-wider">
                                                            予定価格: {item.estimatedPrice}
                                                        </span>
                                                    )}
                                                </div>
                                                <Link href={`/project/${item.id}`} className="text-sm font-serif tracking-wider font-semibold hover:text-accent transition-colors block truncate max-w-2xl">
                                                    {item.title}
                                                </Link>
                                                {item.winningContractor && (
                                                    <p className="text-[10px] text-green-600 mt-1.5 tracking-wider">🏆 落札元請け: {item.winningContractor}</p>
                                                )}
                                                {item.description && (
                                                    <p className="text-[11px] text-secondary/50 mt-2 tracking-wider line-clamp-1">
                                                        {item.description}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Status Switcher & Actions */}
                                            <div className="flex items-center gap-3 self-end md:self-center">
                                                <div className="flex items-center gap-2 bg-slate-50 border border-border/20 px-3 py-1.5 rounded-md">
                                                    <span className="text-[9px] tracking-wider text-secondary/40 uppercase font-bold">営業状況:</span>
                                                    <select
                                                        value={currentStatus}
                                                        onChange={(e) => updateStatus(item.id, e.target.value as SalesStatus)}
                                                        className={`text-xs font-semibold tracking-wider bg-transparent border-none focus:outline-none cursor-pointer ${config.color}`}
                                                    >
                                                        {(Object.keys(statusConfig) as SalesStatus[]).map((status) => (
                                                            <option key={status} value={status} className="text-secondary font-sans font-normal">
                                                                {statusConfig[status].label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <Link
                                                    href={`/project/${item.id}`}
                                                    className="text-secondary/30 hover:text-accent p-2 rounded-md hover:bg-accent/5 transition-all"
                                                    title="詳細を見る"
                                                >
                                                    <ExternalLink size={14} />
                                                </Link>
                                                <button
                                                    onClick={() => removeItem(item.id)}
                                                    className="text-secondary/30 hover:text-red-400 p-2 rounded-md hover:bg-red-50 transition-all cursor-pointer"
                                                    title="削除"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        )}
                    </div>
                </div>
            )}
        </AppShell>
    );
}

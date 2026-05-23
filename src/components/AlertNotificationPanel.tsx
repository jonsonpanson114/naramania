'use client';

import { useMemo, useState } from 'react';
import { BiddingItem } from '@/types/bidding';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, ArrowRight, X, FileText } from 'lucide-react';
import Link from 'next/link';

interface AlertNotificationPanelProps {
    items: BiddingItem[];
}

export function AlertNotificationPanel({ items }: AlertNotificationPanelProps) {
    const [keywords] = useState<string[]>(() => {
        if (typeof window === 'undefined') return [];
        const stored = localStorage.getItem('naramania_alert_keywords');
        if (!stored) return ['サッシ', 'エレベーター'];
        return stored.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    });
    const [dismissed, setDismissed] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const matchingItems = useMemo(() => {
        if (keywords.length === 0) return [];

        // Filter items from the last 7 days
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        return items.filter(item => {
            const announceDate = new Date(item.announcementDate);
            if (announceDate < oneWeekAgo) return false;

            const searchableText = [
                item.title,
                item.description || '',
                ...(item.tags || [])
            ].join(' ').toLowerCase();

            return keywords.some(kw => searchableText.includes(kw));
        });
    }, [keywords, items]);

    if (dismissed || matchingItems.length === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mb-8"
        >
            <div className="bg-gradient-to-r from-accent/10 to-indigo-50/50 backdrop-blur-xl border border-accent/20 rounded-2xl p-6 shadow-premium relative overflow-hidden">
                {/* Decorative glow */}
                <div className="absolute -right-10 -top-10 w-32 h-32 bg-accent/10 rounded-full blur-2xl pointer-events-none" />

                <div className="flex items-start gap-4">
                    <div className="bg-accent/10 p-3 rounded-xl border border-accent/20 text-accent animate-bounce shadow-sm shrink-0">
                        <Bell className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[9px] tracking-[0.2em] font-bold text-accent border border-accent/20 bg-accent/5 px-2 py-0.5 rounded-sm uppercase">
                                新着マッチング
                            </span>
                            <span className="text-xs text-secondary/40 tracking-wider">
                                設定キーワード: {keywords.join(', ')}
                            </span>
                        </div>
                        <h4 className="text-base font-serif font-semibold mt-2 tracking-wide text-primary">
                            ご登録の商材に関連する新着入札案件が <span className="text-accent text-lg font-bold">{matchingItems.length}</span> 件見つかりました！
                        </h4>
                        <p className="text-xs text-secondary/60 mt-1 tracking-wide">
                            過去7日以内に公示された、自社で下請け受注できる可能性が高い注目の案件です。
                        </p>

                        {/* Collapsible Details */}
                        <div className="mt-4">
                            <button
                                onClick={() => setIsOpen(!isOpen)}
                                className="text-xs text-accent font-bold hover:underline tracking-wider flex items-center gap-1.5 cursor-pointer focus:outline-none"
                            >
                                {isOpen ? '一覧を閉じる' : 'マッチした新着案件を見る'}
                                <ArrowRight className={`w-3.5 h-3.5 transition-transform duration-300 ${isOpen ? 'rotate-90' : ''}`} />
                            </button>

                            <AnimatePresence>
                                {isOpen && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden mt-3 space-y-2 max-h-60 overflow-y-auto pr-2"
                                    >
                                        {matchingItems.map(item => (
                                            <div
                                                key={item.id}
                                                className="bg-white/60 hover:bg-white border border-border/20 p-3 rounded-lg flex items-center justify-between gap-4 transition-all"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[9px] font-bold text-secondary/50">{item.municipality}</span>
                                                        <span className="text-[8px] bg-red-50 text-red-600 px-1.5 py-0.2 rounded border border-red-100 font-bold font-mono">NEW</span>
                                                    </div>
                                                    <Link href={`/project/${item.id}`} className="text-xs text-primary font-serif font-semibold truncate hover:text-accent transition-colors block mt-1">
                                                        {item.title}
                                                    </Link>
                                                </div>
                                                <Link
                                                    href={`/project/${item.id}`}
                                                    className="bg-accent/5 hover:bg-accent/10 border border-accent/15 px-3 py-1.5 rounded text-[10px] text-accent font-semibold tracking-wider flex items-center gap-1 shrink-0 transition-all"
                                                >
                                                    <FileText size={10} />
                                                    詳細へ
                                                </Link>
                                            </div>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    <button
                        onClick={() => setDismissed(true)}
                        className="text-secondary/30 hover:text-secondary/70 p-1.5 rounded-md hover:bg-black/5 transition-all cursor-pointer absolute top-4 right-4"
                        aria-label="閉じる"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>
        </motion.div>
    );
}

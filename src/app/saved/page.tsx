'use client';

import { useState, useEffect } from 'react';
import { BiddingItem } from '@/types/bidding';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, Trash2, ExternalLink } from 'lucide-react';
import Link from 'next/link';

export default function SavedPage() {
    const [savedItems, setSavedItems] = useState<BiddingItem[]>([]);

    useEffect(() => {
        const stored = localStorage.getItem('naramania_saved');
        if (stored) {
            setSavedItems(JSON.parse(stored));
        }
    }, []);

    const removeItem = (id: string) => {
        const updated = savedItems.filter(item => item.id !== id);
        setSavedItems(updated);
        localStorage.setItem('naramania_saved', JSON.stringify(updated));
    };

    return (
        <div className="flex min-h-screen bg-background text-primary font-serif">
            <Sidebar />
            <main className="flex-1 ml-64 p-16">
                <Header />

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <h2 className="text-3xl tracking-widest mb-4 font-serif">保存済み案件</h2>
                    <p className="text-secondary/60 text-sm tracking-wider mb-12">
                        ブックマークした案件を管理できます。
                    </p>
                </motion.div>

                {savedItems.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="bg-white/80 backdrop-blur-xl shadow-premium p-16 rounded-lg border border-white/50 text-center"
                    >
                        <Bookmark className="w-12 h-12 text-secondary/20 mx-auto mb-6" />
                        <p className="text-secondary/40 tracking-wider text-sm mb-2">保存済みの案件はありません</p>
                        <p className="text-secondary/30 tracking-wider text-xs">
                            ダッシュボードや検索結果から案件を保存してください。
                        </p>
                        <Link href="/" className="inline-block mt-8 text-accent hover:text-accent/80 text-sm tracking-wider border border-accent/20 px-6 py-2 rounded-md hover:bg-accent/5 transition-all">
                            ダッシュボードへ
                        </Link>
                    </motion.div>
                ) : (
                    <div className="space-y-4">
                        <AnimatePresence>
                            {savedItems.map((item, index) => (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 10 }}
                                    transition={{ duration: 0.3, delay: index * 0.05 }}
                                    className="bg-white/80 backdrop-blur-xl shadow-premium p-6 rounded-lg border border-white/50 flex items-center justify-between group hover:border-accent/20 transition-all"
                                >
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className={`text-[8px] tracking-[0.2em] border px-2 py-0.5 rounded-sm uppercase font-bold ${item.status === '落札' ? 'text-green-600 border-green-200 bg-green-50' :
                                                    item.status === '受付中' ? 'text-secondary border-secondary/20 bg-secondary/5' :
                                                        item.status === '締切間近' ? 'text-amber-600 border-amber-200 bg-amber-50' :
                                                            'text-gray-300 border-gray-100'
                                                }`}>
                                                {item.status}
                                            </span>
                                            <span className="text-[10px] text-secondary/40 tracking-wider">{item.municipality}</span>
                                        </div>
                                        <Link href={`/project/${item.id}`} className="text-sm tracking-wider hover:text-accent transition-colors">
                                            {item.title}
                                        </Link>
                                        {item.winningContractor && (
                                            <p className="text-[10px] text-green-600 mt-1.5 tracking-wider">🏆 {item.winningContractor}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <Link
                                            href={`/project/${item.id}`}
                                            className="text-secondary/30 hover:text-accent transition-colors"
                                        >
                                            <ExternalLink size={14} />
                                        </Link>
                                        <button
                                            onClick={() => removeItem(item.id)}
                                            className="text-secondary/30 hover:text-red-400 transition-colors cursor-pointer"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </main>
        </div>
    );
}

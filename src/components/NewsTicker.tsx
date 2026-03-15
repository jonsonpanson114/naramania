'use client';

import { useEffect, useState } from 'react';
import { NewsItem } from '@/services/news_service';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Newspaper } from 'lucide-react';
import Link from 'next/link';

export function NewsTicker() {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch('/api/news');
                const data: NewsItem[] = await res.json();
                setNews(data.slice(0, 5)); // Top 5 recent news
            } catch { }
        };
        load();
    }, []);

    useEffect(() => {
        if (news.length === 0) return;
        const timer = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % news.length);
        }, 5000);
        return () => clearInterval(timer);
    }, [news]);

    if (news.length === 0) return null;

    const current = news[currentIndex];

    return (
        <div className="mb-10 bg-white/40 backdrop-blur-md border border-accent/10 rounded-2xl p-1 overflow-hidden shadow-sm">
            <div className="flex items-center gap-4 px-4 py-2">
                <div className="shrink-0 flex items-center gap-2 px-3 py-1 bg-accent/10 rounded-full text-accent">
                    <Newspaper size={14} />
                    <span className="text-[10px] font-bold tracking-[0.2em] uppercase font-serif">奈良ニュース 速報</span>
                </div>
                
                <div className="flex-1 overflow-hidden relative h-6">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentIndex}
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -20, opacity: 0 }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                            className="absolute inset-0 flex items-center"
                        >
                            <Link 
                                href="/#news" 
                                className="text-xs text-primary font-serif truncate hover:text-accent transition-colors block w-full"
                            >
                                <span className="text-[10px] text-gray-400 mr-3">{current.sourceLabel}</span>
                                {current.title}
                            </Link>
                        </motion.div>
                    </AnimatePresence>
                </div>

                <Link 
                    href="/#news" 
                    className="shrink-0 flex items-center gap-1 text-[10px] text-secondary/40 hover:text-accent transition-colors tracking-widest uppercase font-serif"
                >
                    すべて見る
                    <ChevronRight size={12} />
                </Link>
            </div>
        </div>
    );
}

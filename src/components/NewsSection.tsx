'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { NewsItem } from '@/services/news_service';

const SOURCE_STYLES: Record<string, { color: string; bg: string; border: string }> = {
    shinpou:   { color: '#1d4ed8', bg: '#eff6ff',  border: '#bfdbfe' },
    constnews: { color: '#7c3aed', bg: '#f5f3ff',  border: '#ddd6fe' },
    decn:      { color: '#065f46', bg: '#ecfdf5',  border: '#a7f3d0' },
    naranp:    { color: '#991b1b', bg: '#fef2f2',  border: '#fecaca' },
    kentsu:    { color: '#92400e', bg: '#fffbeb',  border: '#fde68a' },
};

function formatDate(dateStr: string): string {
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return `${d.getMonth() + 1}月${d.getDate()}日`;
    } catch {
        return dateStr;
    }
}

type SourceFilter = 'all' | string;

export function NewsSection() {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeSource, setActiveSource] = useState<SourceFilter>('all');
    const [refreshing, setRefreshing] = useState(false);

    const load = async () => {
        try {
            const res = await fetch('/api/news');
            const data: NewsItem[] = await res.json();
            setNews(data);
        } catch {
            // silent fail
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleRefresh = () => {
        setRefreshing(true);
        load();
    };

    // ソースの一覧（取得できたもののみ）
    const sources = Array.from(new Set(news.map(n => n.source)));
    const filtered = activeSource === 'all' ? news : news.filter(n => n.source === activeSource);

    return (
        <section className="mt-24">
            {/* Section Header */}
            <div className="flex items-center gap-6 mb-10">
                <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, rgba(197,160,89,0.2), transparent)' }} />
                <div className="flex items-center gap-4">
                    <h2 className="text-[10px] tracking-[0.35em] text-secondary uppercase font-serif">建設ニュース</h2>
                    <button
                        onClick={handleRefresh}
                        className="text-gray-300 hover:text-accent transition-colors duration-300"
                        title="更新"
                    >
                        <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                    </button>
                </div>
                <div className="flex-1 h-px" style={{ background: 'linear-gradient(to left, rgba(197,160,89,0.2), transparent)' }} />
            </div>

            {/* Source Filter Tabs */}
            {!loading && news.length > 0 && (
                <div className="flex justify-center mb-8">
                    <div className="flex items-center gap-8 pb-5 px-8 border-b border-border/30">
                        {(['all', ...sources] as SourceFilter[]).map(src => {
                            const label = src === 'all' ? 'すべて' : (news.find(n => n.source === src)?.sourceLabel ?? src);
                            const count = src === 'all' ? news.length : news.filter(n => n.source === src).length;
                            const isActive = activeSource === src;
                            return (
                                <button
                                    key={src}
                                    onClick={() => setActiveSource(src)}
                                    className="relative text-[10px] tracking-[0.25em] font-serif transition-all duration-300 flex items-center gap-1.5"
                                    style={{ color: isActive ? '#3a3a3a' : '#9ca3af', fontWeight: isActive ? 600 : 400 }}
                                >
                                    {label}
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-sans"
                                        style={{
                                            color: isActive ? '#c5a059' : '#9ca3af',
                                            backgroundColor: isActive ? 'rgba(197,160,89,0.1)' : '#f3f4f6',
                                        }}>
                                        {count}
                                    </span>
                                    {isActive && (
                                        <motion.span
                                            layoutId="newsFilterDot"
                                            className="absolute rounded-full"
                                            style={{ bottom: '-21px', left: '50%', transform: 'translateX(-50%)', width: '4px', height: '4px', backgroundColor: '#c5a059' }}
                                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                        />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Loading skeleton */}
            {loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="bg-white/60 rounded-sm p-6 animate-pulse h-32 border border-border/20" />
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!loading && news.length === 0 && (
                <p className="text-center py-12 text-sm tracking-widest text-secondary/40 font-serif">
                    ニュースを取得できませんでした
                </p>
            )}

            {/* News Grid */}
            {!loading && filtered.length > 0 && (
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeSource}
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.35 }}
                    >
                        {filtered.slice(0, 18).map((item, index) => {
                            const style = SOURCE_STYLES[item.source] ?? { color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' };
                            return (
                                <motion.a
                                    key={item.id}
                                    href={item.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="bg-white group block p-6 border rounded-sm hover:shadow-sm transition-all duration-300"
                                    style={{ borderColor: '#e6e2d8' }}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3, delay: index * 0.025 }}
                                >
                                    <div className="flex items-start justify-between gap-2 mb-3">
                                        <span
                                            className="text-[9px] tracking-[0.2em] px-2 py-0.5 rounded-sm font-bold uppercase shrink-0"
                                            style={{ color: style.color, backgroundColor: style.bg, border: `1px solid ${style.border}` }}
                                        >
                                            {item.sourceLabel}
                                        </span>
                                        <span className="text-[10px] text-gray-400 tracking-widest shrink-0 font-serif">
                                            {formatDate(item.date)}
                                        </span>
                                    </div>
                                    <h3 className="text-sm text-primary font-serif leading-relaxed tracking-wide group-hover:text-accent transition-colors duration-300 line-clamp-3">
                                        {item.title}
                                    </h3>
                                    {item.excerpt && (
                                        <p className="text-[11px] text-secondary/50 mt-2 leading-relaxed line-clamp-2 font-sans">
                                            {item.excerpt}
                                        </p>
                                    )}
                                    <div className="flex items-center gap-1 mt-4 text-[10px] text-gray-300 group-hover:text-accent transition-colors duration-300">
                                        <ExternalLink size={10} />
                                        <span className="tracking-widest">記事を読む</span>
                                    </div>
                                </motion.a>
                            );
                        })}
                    </motion.div>
                </AnimatePresence>
            )}

            {!loading && filtered.length > 0 && (
                <p className="text-right text-[10px] tracking-widest mt-5 text-secondary/40 font-serif">
                    {filtered.length}件のニュース
                </p>
            )}
        </section>
    );
}

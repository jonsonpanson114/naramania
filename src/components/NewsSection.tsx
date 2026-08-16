'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, RefreshCw, Search, X } from 'lucide-react';
import { NewsItem } from '@/services/news_service';

const SOURCE_STYLES: Record<string, { color: string; bg: string; border: string }> = {
    shinpou:   { color: '#1d4ed8', bg: '#eff6ff',  border: '#bfdbfe' },
    constnews: { color: '#7c3aed', bg: '#f5f3ff',  border: '#ddd6fe' },
    decn:      { color: '#065f46', bg: '#ecfdf5',  border: '#a7f3d0' },
    naranp:    { color: '#991b1b', bg: '#fef2f2',  border: '#fecaca' },
    kentsu:    { color: '#92400e', bg: '#fffbeb',  border: '#fde68a' },
};

/** "2026-08-16" をローカル日付として解釈する（new Date(str) はUTC扱いで前日にずれる） */
function parseLocalDate(dateStr: string): Date | null {
    const m = dateStr?.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
}

/** 今日を0とした経過日数。未来日は負になる */
function daysSince(d: Date): number {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return Math.round((today - target) / 86400000);
}

/** 直近はひと目で分かるよう相対表記、それ以降は日付表記にする */
function formatDate(dateStr: string): string {
    const d = parseLocalDate(dateStr);
    if (!d) return dateStr || '日付不明';
    const diff = daysSince(d);
    if (diff === 0) return '今日';
    if (diff === 1) return '昨日';
    if (diff >= 2 && diff <= 6) return `${diff}日前`;
    return `${d.getMonth() + 1}月${d.getDate()}日`;
}

type SourceFilter = 'all' | string;
type CategoryFilter = 'all' | 'construction' | 'general';

function isConstructionNews(item: NewsItem): boolean {
    return item.category === 'construction' || ['constnews', 'kentsu', 'decn'].includes(item.source);
}

interface NewsSectionProps {
    /** 検索ボックスを表示するか（ニュース専用ページ用） */
    searchable?: boolean;
    /** グリッドに表示する最大件数（未指定なら18件） */
    maxItems?: number;
}

export function NewsSection({ searchable = false, maxItems = 18 }: NewsSectionProps) {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState<CategoryFilter>('construction');
    const [activeSource, setActiveSource] = useState<SourceFilter>('all');
    const [refreshing, setRefreshing] = useState(false);
    const [keyword, setKeyword] = useState('');

    // 日付が常に出るようになったので、NEWは3日以内に絞って目印としての意味を保つ
    const isNewItem = (dateStr: string) => {
        const d = parseLocalDate(dateStr);
        if (!d) return false;
        const diff = daysSince(d);
        return diff >= 0 && diff <= 3;
    };

    const load = async () => {
        try {
            const res = await fetch('/api/news');
            const data: unknown = await res.json();
            setNews(res.ok && Array.isArray(data) ? data : []);
        } catch {
            setNews([]);
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

    // カテゴリフィルタ
    const filteredByCategory = activeCategory === 'all' 
        ? news 
        : activeCategory === 'construction'
            ? news.filter(isConstructionNews)
            : news.filter(n => !isConstructionNews(n));

    // ソースの一覧（カテゴリフィルタ後のもの）
    const sources = Array.from(new Set(filteredByCategory.map(n => n.source)));
    const filteredBySource = activeSource === 'all' ? filteredByCategory : filteredByCategory.filter(n => n.source === activeSource);

    // キーワード検索（タイトル・本文抜粋）
    const trimmedKeyword = keyword.trim();
    const filtered = trimmedKeyword
        ? filteredBySource.filter(n =>
            n.title.includes(trimmedKeyword) || (n.excerpt ?? '').includes(trimmedKeyword)
        )
        : filteredBySource;

    // カテゴリ変更時にソースフィルタをリセット
    const handleCategoryChange = (cat: CategoryFilter) => {
        setActiveCategory(cat);
        setActiveSource('all');
    };

    return (
        <section className="mt-10" id="news">
            {/* Section Header */}
            <div className="flex items-center gap-6 mb-10">
                <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, rgba(197,160,89,0.2), transparent)' }} />
                <div className="flex items-center gap-4">
                    <h2 className="text-[10px] tracking-[0.35em] text-secondary uppercase font-serif">奈良ニュース</h2>
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

            {/* Category Filter Tabs */}
            {!loading && news.length > 0 && (
                <div className="flex justify-center mb-6">
                    <div className="flex items-center gap-1 bg-white/40 p-1 rounded-full border border-border/20 shadow-inner">
                        <button
                            onClick={() => handleCategoryChange('all')}
                            className={`px-6 py-2 rounded-full text-[10px] tracking-[0.2em] transition-all ${activeCategory === 'all' ? 'bg-primary text-white shadow-md' : 'text-secondary hover:bg-white/60'}`}
                        >
                            すべて
                        </button>
                        <button
                            onClick={() => handleCategoryChange('construction')}
                            className={`px-6 py-2 rounded-full text-[10px] tracking-[0.2em] transition-all ${activeCategory === 'construction' ? 'bg-primary text-white shadow-md' : 'text-secondary hover:bg-white/60'}`}
                        >
                            建設系
                        </button>
                        <button
                            onClick={() => handleCategoryChange('general')}
                            className={`px-6 py-2 rounded-full text-[10px] tracking-[0.2em] transition-all ${activeCategory === 'general' ? 'bg-primary text-white shadow-md' : 'text-secondary hover:bg-white/60'}`}
                        >
                            一般ニュース
                        </button>
                    </div>
                </div>
            )}

            {/* Search Box */}
            {searchable && !loading && news.length > 0 && (
                <div className="flex justify-center mb-6">
                    <div className="relative w-full max-w-md">
                        <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary/40" />
                        <input
                            type="text"
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            placeholder="キーワードでニュースを検索"
                            className="w-full rounded-full border border-border/30 bg-white/60 py-2.5 pl-10 pr-9 text-xs tracking-wider text-primary placeholder:text-secondary/40 focus:outline-none focus:ring-1 focus:ring-accent/40"
                        />
                        {keyword && (
                            <button
                                onClick={() => setKeyword('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary/40 hover:text-accent"
                                aria-label="検索をクリア"
                            >
                                <X size={13} />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Source Filter Tabs */}
            {!loading && news.length > 0 && (
                <div className="flex justify-center mb-8">
                    <div className="flex items-center gap-8 pb-5 px-8 border-b border-border/30">
                        {(['all', ...sources] as SourceFilter[]).map(src => {
                            const label = src === 'all' ? 'すべて' : (news.find(n => n.source === src)?.sourceLabel ?? src);
                            const count = src === 'all' ? filteredByCategory.length : filteredByCategory.filter(n => n.source === src).length;
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
            {!loading && news.length > 0 && filtered.length === 0 && (
                <p className="text-center py-12 text-sm tracking-widest text-secondary/40 font-serif">
                    「{trimmedKeyword}」に一致するニュースは見つかりませんでした
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
                        {filtered.slice(0, maxItems).map((item, index) => {
                            const style = SOURCE_STYLES[item.source] ?? { color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' };
                            return (
                                <motion.a
                                    key={item.id}
                                    href={item.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="bg-white group flex h-full flex-col p-5 border rounded-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md hover:border-accent/40"
                                    style={{ borderColor: '#e6e2d8' }}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3, delay: index * 0.025 }}
                                >
                                    <div className="flex items-center justify-between gap-2 mb-3">
                                        <div className="flex min-w-0 items-center gap-1.5">
                                            <span
                                                className="text-[9px] tracking-[0.15em] px-2 py-0.5 rounded-sm font-bold shrink-0"
                                                style={{ color: style.color, backgroundColor: style.bg, border: `1px solid ${style.border}` }}
                                            >
                                                {item.sourceLabel}
                                            </span>
                                            {item.category === 'construction' && (
                                                <span className="shrink-0 rounded-sm border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-emerald-700">
                                                    入札・建設
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1.5">
                                            {isNewItem(item.date) && (
                                                <span className="rounded-sm bg-red-500 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white">NEW</span>
                                            )}
                                            <span className="text-[11px] font-medium tracking-wide text-secondary/70 tabular-nums">
                                                {formatDate(item.date)}
                                            </span>
                                        </div>
                                    </div>

                                    <h3 className="text-[15px] text-primary font-serif leading-[1.75] tracking-wide group-hover:text-accent transition-colors duration-300 line-clamp-3">
                                        {item.title}
                                    </h3>

                                    {item.excerpt && (
                                        <p className="text-xs text-secondary/60 mt-3 leading-[1.9] line-clamp-3 font-sans">
                                            {item.excerpt}
                                        </p>
                                    )}

                                    {/* mt-auto で本文量に関わらずリンクをカード下端に揃える */}
                                    <div className="flex items-center gap-1.5 mt-auto pt-4 text-[10px] text-gray-400 group-hover:text-accent transition-colors duration-300">
                                        <ExternalLink size={11} />
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

'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, ExternalLink, RefreshCw, Search, X } from 'lucide-react';
import Link from 'next/link';
import { NewsItem } from '@/services/news_service';

const SOURCE_STYLES: Record<string, { color: string; bg: string; border: string }> = {
    shinpou:   { color: '#1d4ed8', bg: '#eff6ff',  border: '#bfdbfe' },
    constnews: { color: '#7c3aed', bg: '#f5f3ff',  border: '#ddd6fe' },
    decn:      { color: '#065f46', bg: '#ecfdf5',  border: '#a7f3d0' },
    naranp:    { color: '#991b1b', bg: '#fef2f2',  border: '#fecaca' },
    kentsu:    { color: '#92400e', bg: '#fffbeb',  border: '#fde68a' },
};

function sourceStyle(source: string) {
    return SOURCE_STYLES[source] ?? { color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' };
}

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

/** 日付が常に出るようになったので、NEWは3日以内に絞って目印としての意味を保つ */
function isNewItem(dateStr: string): boolean {
    const d = parseLocalDate(dateStr);
    if (!d) return false;
    const diff = daysSince(d);
    return diff >= 0 && diff <= 3;
}

type SourceFilter = 'all' | string;
type CategoryFilter = 'all' | 'construction' | 'general';

function isConstructionNews(item: NewsItem): boolean {
    return item.category === 'construction' || ['constnews', 'kentsu', 'decn'].includes(item.source);
}

function MetaRow({ item }: { item: NewsItem }) {
    const style = sourceStyle(item.source);
    return (
        <div className="flex flex-wrap items-center gap-2">
            <span
                className="shrink-0 rounded-sm px-2 py-0.5 text-[10px] font-bold tracking-[0.15em]"
                style={{ color: style.color, backgroundColor: style.bg, border: `1px solid ${style.border}` }}
            >
                {item.sourceLabel}
            </span>
            {item.category === 'construction' && (
                <span className="shrink-0 rounded-sm border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-emerald-700">
                    入札・建設
                </span>
            )}
            {isNewItem(item.date) && (
                <span className="shrink-0 rounded-sm bg-red-500 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white">
                    NEW
                </span>
            )}
            <span className="ml-auto shrink-0 text-[12px] font-medium tracking-wide text-secondary/70 tabular-nums">
                {formatDate(item.date)}
            </span>
        </div>
    );
}

/** 先頭記事。ニュースサイトのトップ記事のように大きく見せる */
function FeaturedArticle({ item }: { item: NewsItem }) {
    return (
        <motion.a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group block rounded-sm border bg-white p-7 transition-all duration-300 hover:border-accent/40 hover:shadow-lg md:p-9"
            style={{ borderColor: '#e6e2d8' }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
        >
            <MetaRow item={item} />
            <h3 className="mt-5 font-serif text-xl leading-[1.6] tracking-wide text-primary transition-colors duration-300 group-hover:text-accent md:text-2xl">
                {item.title}
            </h3>
            {item.excerpt && (
                <p className="mt-4 line-clamp-3 font-sans text-sm leading-[2] text-secondary/70">
                    {item.excerpt}
                </p>
            )}
            <div className="mt-6 flex items-center gap-1.5 text-[11px] tracking-widest text-gray-400 transition-colors duration-300 group-hover:text-accent">
                <ExternalLink size={12} />
                <span>記事を読む</span>
            </div>
        </motion.a>
    );
}

/** 2件目以降。囲みを外して見出しリストにし、視覚的なノイズを減らす */
function ArticleRow({ item, index }: { item: NewsItem; index: number }) {
    return (
        <motion.a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group block border-b border-border/40 px-2 py-6 transition-colors duration-300 hover:bg-white/60"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(index, 6) * 0.03 }}
        >
            <MetaRow item={item} />
            <h3 className="mt-3 font-serif text-[17px] leading-[1.7] tracking-wide text-primary transition-colors duration-300 group-hover:text-accent">
                {item.title}
            </h3>
            {item.excerpt && (
                <p className="mt-2.5 line-clamp-2 font-sans text-[13px] leading-[1.9] text-secondary/60">
                    {item.excerpt}
                </p>
            )}
        </motion.a>
    );
}

interface NewsSectionProps {
    /** 検索ボックスと媒体別の絞り込みを出す（ニュース専用ページ用） */
    detailed?: boolean;
    /** 一度に表示する件数。「もっと見る」で同じ件数ずつ増える */
    pageSize?: number;
    /** ニュース一覧ページへの導線を出す（トップページ用） */
    showAllLink?: boolean;
}

export function NewsSection({ detailed = false, pageSize = 6, showAllLink = false }: NewsSectionProps) {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState<CategoryFilter>('construction');
    const [activeSource, setActiveSource] = useState<SourceFilter>('all');
    const [refreshing, setRefreshing] = useState(false);
    const [keyword, setKeyword] = useState('');
    const [visibleCount, setVisibleCount] = useState(pageSize);

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

    // 媒体の一覧（カテゴリフィルタ後のもの）
    const sources = Array.from(new Set(filteredByCategory.map(n => n.source)));
    const filteredBySource = activeSource === 'all' ? filteredByCategory : filteredByCategory.filter(n => n.source === activeSource);

    // キーワード検索（タイトル・本文抜粋）
    const trimmedKeyword = keyword.trim();
    const filtered = trimmedKeyword
        ? filteredBySource.filter(n =>
            n.title.includes(trimmedKeyword) || (n.excerpt ?? '').includes(trimmedKeyword)
        )
        : filteredBySource;

    // 絞り込みを変えたら表示件数を初期値に戻す
    useEffect(() => {
        setVisibleCount(pageSize);
    }, [activeCategory, activeSource, trimmedKeyword, pageSize]);

    const handleCategoryChange = (cat: CategoryFilter) => {
        setActiveCategory(cat);
        setActiveSource('all');
    };

    const visible = filtered.slice(0, visibleCount);
    const [lead, ...rest] = visible;
    const remaining = filtered.length - visible.length;

    return (
        <section className="mt-10" id="news">
            {/* Section Header */}
            <div className="mb-8 flex items-center gap-6">
                <div className="h-px flex-1" style={{ background: 'linear-gradient(to right, rgba(197,160,89,0.2), transparent)' }} />
                <div className="flex items-center gap-4">
                    <h2 className="font-serif text-[10px] uppercase tracking-[0.35em] text-secondary">奈良ニュース</h2>
                    <button
                        onClick={handleRefresh}
                        className="text-gray-300 transition-colors duration-300 hover:text-accent"
                        title="更新"
                    >
                        <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                    </button>
                </div>
                <div className="h-px flex-1" style={{ background: 'linear-gradient(to left, rgba(197,160,89,0.2), transparent)' }} />
            </div>

            {/* Category Filter Tabs */}
            {!loading && news.length > 0 && (
                <div className="mb-6 flex justify-center">
                    <div className="flex items-center gap-1 rounded-full border border-border/20 bg-white/40 p-1 shadow-inner">
                        {([
                            ['all', 'すべて'],
                            ['construction', '建設系'],
                            ['general', '一般ニュース'],
                        ] as Array<[CategoryFilter, string]>).map(([value, label]) => (
                            <button
                                key={value}
                                onClick={() => handleCategoryChange(value)}
                                className={`rounded-full px-6 py-2 text-[10px] tracking-[0.2em] transition-all ${activeCategory === value ? 'bg-primary text-white shadow-md' : 'text-secondary hover:bg-white/60'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Search Box */}
            {detailed && !loading && news.length > 0 && (
                <div className="mb-6 flex justify-center">
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

            {/* Source Filter Tabs（媒体が多く横に伸びるため一覧ページのみ） */}
            {detailed && !loading && news.length > 0 && (
                <div className="mb-8 flex justify-center">
                    <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-b border-border/30 px-8 pb-5">
                        {(['all', ...sources] as SourceFilter[]).map(src => {
                            const label = src === 'all' ? 'すべて' : (news.find(n => n.source === src)?.sourceLabel ?? src);
                            const count = src === 'all' ? filteredByCategory.length : filteredByCategory.filter(n => n.source === src).length;
                            const isActive = activeSource === src;
                            return (
                                <button
                                    key={src}
                                    onClick={() => setActiveSource(src)}
                                    className="relative flex items-center gap-1.5 font-serif text-[10px] tracking-[0.25em] transition-all duration-300"
                                    style={{ color: isActive ? '#3a3a3a' : '#9ca3af', fontWeight: isActive ? 600 : 400 }}
                                >
                                    {label}
                                    <span
                                        className="rounded-full px-1.5 py-0.5 font-sans text-[9px]"
                                        style={{
                                            color: isActive ? '#c5a059' : '#9ca3af',
                                            backgroundColor: isActive ? 'rgba(197,160,89,0.1)' : '#f3f4f6',
                                        }}
                                    >
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

            {/* 記事は読みやすい幅に収める */}
            <div className="mx-auto max-w-3xl">
                {/* Loading skeleton */}
                {loading && (
                    <div className="space-y-6">
                        <div className="h-52 animate-pulse rounded-sm border border-border/20 bg-white/60" />
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="h-24 animate-pulse rounded-sm border border-border/20 bg-white/40" />
                        ))}
                    </div>
                )}

                {/* Empty state */}
                {!loading && news.length === 0 && (
                    <p className="py-12 text-center font-serif text-sm tracking-widest text-secondary/40">
                        ニュースを取得できませんでした
                    </p>
                )}
                {!loading && news.length > 0 && filtered.length === 0 && (
                    <p className="py-12 text-center font-serif text-sm tracking-widest text-secondary/40">
                        {trimmedKeyword
                            ? `「${trimmedKeyword}」に一致するニュースは見つかりませんでした`
                            : '該当するニュースがありません'}
                    </p>
                )}

                {/* 記事一覧: 先頭は大きく、以降は見出しリスト */}
                {!loading && lead && (
                    <>
                        <FeaturedArticle key={lead.id} item={lead} />
                        {rest.length > 0 && (
                            <div className="mt-4">
                                {rest.map((item, index) => (
                                    <ArticleRow key={item.id} item={item} index={index} />
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* 続きの読み込み / 一覧への導線 */}
                {!loading && filtered.length > 0 && (
                    <div className="mt-8 flex flex-col items-center gap-3">
                        {showAllLink ? (
                            remaining > 0 && (
                                <Link
                                    href="/news"
                                    className="flex items-center gap-2 rounded-full border border-border/40 bg-white/60 px-7 py-2.5 font-serif text-[11px] tracking-[0.2em] text-secondary transition-all hover:border-accent/40 hover:text-accent"
                                >
                                    ニュースをすべて見る（他 {remaining} 件）
                                    <ArrowRight size={13} />
                                </Link>
                            )
                        ) : (
                            remaining > 0 && (
                                <button
                                    onClick={() => setVisibleCount(c => c + pageSize)}
                                    className="rounded-full border border-border/40 bg-white/60 px-7 py-2.5 font-serif text-[11px] tracking-[0.2em] text-secondary transition-all hover:border-accent/40 hover:text-accent"
                                >
                                    もっと見る（残り {remaining} 件）
                                </button>
                            )
                        )}
                        <p className="font-serif text-[10px] tracking-widest text-secondary/40">
                            全 {filtered.length} 件中 {visible.length} 件を表示
                        </p>
                    </div>
                )}
            </div>
        </section>
    );
}

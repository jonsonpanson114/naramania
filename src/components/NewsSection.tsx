'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, ExternalLink, RefreshCw, Search, X } from 'lucide-react';
import Link from 'next/link';
import { NewsItem } from '@/services/news_service';

const SOURCE_LABEL_COLOR: Record<string, string> = {
    shinpou: '#1d4ed8',
    constnews: '#7c3aed',
    decn: '#065f46',
    naranp: '#991b1b',
    kentsu: '#92400e',
};

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

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

/** 日付見出し。「8月12日(水)」に、直近なら「今日」等を添える */
function formatDateHeading(dateStr: string): { main: string; relative?: string } {
    const d = parseLocalDate(dateStr);
    if (!d) return { main: '日付不明' };
    const main = `${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
    const diff = daysSince(d);
    if (diff === 0) return { main, relative: '今日' };
    if (diff === 1) return { main, relative: '昨日' };
    if (diff >= 2 && diff <= 6) return { main, relative: `${diff}日前` };
    return { main };
}

type CategoryFilter = 'all' | 'construction' | 'general';

function isConstructionNews(item: NewsItem): boolean {
    return item.category === 'construction' || ['constnews', 'kentsu', 'decn'].includes(item.source);
}

function hasResults(item: NewsItem): boolean {
    return (item.results?.length ?? 0) > 0;
}

/** 同じ日付の記事をまとめる。filtered は日付降順で渡ってくる前提 */
function groupByDate(items: NewsItem[]): Array<{ date: string; items: NewsItem[] }> {
    const groups: Array<{ date: string; items: NewsItem[] }> = [];
    for (const item of items) {
        const last = groups[groups.length - 1];
        if (last && last.date === item.date) last.items.push(item);
        else groups.push({ date: item.date, items: [item] });
    }
    return groups;
}

/** 落札者と金額。この欄で一番見たい情報なので枠で囲って際立たせる */
function ResultBox({ item }: { item: NewsItem }) {
    if (!item.results?.length) return null;
    return (
        <div className="mt-3 rounded-sm border border-accent/25 bg-accent/[0.06] px-4 py-2.5">
            {item.results.map((r, i) => (
                <div key={`${r.contractor}-${i}`} className="flex items-baseline justify-between gap-3 py-1">
                    <div className="flex min-w-0 items-baseline gap-2">
                        <span
                            className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-bold tracking-wider ${
                                r.kind === '落札'
                                    ? 'bg-accent text-white'
                                    : 'border border-border/50 bg-white text-secondary'
                            }`}
                        >
                            {r.kind}
                        </span>
                        <span className="truncate text-sm font-semibold text-primary">{r.contractor}</span>
                    </div>
                    {r.amount && (
                        <span className="shrink-0 text-sm font-bold tabular-nums text-primary">{r.amount}</span>
                    )}
                </div>
            ))}
        </div>
    );
}

function Article({ item, index }: { item: NewsItem; index: number }) {
    return (
        <motion.a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group block rounded-sm px-3 py-5 transition-colors duration-300 hover:bg-white/70"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: Math.min(index, 8) * 0.025 }}
        >
            {/* 誰の案件か（発注者）を最初に見せる。取れない記事では媒体名だけ出す */}
            <div className="flex items-baseline justify-between gap-3">
                {item.orderer && item.orderer !== item.sourceLabel ? (
                    <span className="truncate font-serif text-[13px] font-semibold tracking-wide text-accent">
                        {item.orderer}
                    </span>
                ) : (
                    <span />
                )}
                <span
                    className="shrink-0 text-[10px] tracking-wider"
                    style={{ color: SOURCE_LABEL_COLOR[item.source] ?? '#9ca3af' }}
                >
                    {item.sourceLabel}
                </span>
            </div>

            <h3 className="mt-2 font-serif text-[17px] leading-[1.7] tracking-wide text-primary transition-colors duration-300 group-hover:text-accent">
                {item.title}
            </h3>

            <ResultBox item={item} />

            {item.excerpt && (
                <p className="mt-2.5 line-clamp-2 font-sans text-[13px] leading-[1.9] text-secondary/60">
                    {item.excerpt}
                </p>
            )}

            <div className="mt-3 flex items-center gap-1.5 text-[10px] tracking-widest text-gray-300 transition-colors duration-300 group-hover:text-accent">
                <ExternalLink size={11} />
                <span>記事を読む</span>
            </div>
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
    const [activeSource, setActiveSource] = useState<string>('all');
    const [onlyResults, setOnlyResults] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [keyword, setKeyword] = useState('');
    const [visibleCount, setVisibleCount] = useState(pageSize);

    const load = async () => {
        try {
            // ブラウザキャッシュが効くと「更新」を押しても古い記事のままになる
            const res = await fetch('/api/news', { cache: 'no-store' });
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

    const filteredByCategory = activeCategory === 'all'
        ? news
        : activeCategory === 'construction'
            ? news.filter(isConstructionNews)
            : news.filter(n => !isConstructionNews(n));

    const sources = Array.from(new Set(filteredByCategory.map(n => n.source)));
    const filteredBySource = activeSource === 'all'
        ? filteredByCategory
        : filteredByCategory.filter(n => n.source === activeSource);

    const trimmedKeyword = keyword.trim();
    const filtered = filteredBySource.filter(n => {
        if (onlyResults && !hasResults(n)) return false;
        if (!trimmedKeyword) return true;
        const haystack = `${n.title} ${n.excerpt ?? ''} ${n.orderer ?? ''} ${(n.results ?? []).map(r => r.contractor).join(' ')}`;
        return haystack.includes(trimmedKeyword);
    });

    // 絞り込みを変えたら表示件数を初期値に戻す
    useEffect(() => {
        setVisibleCount(pageSize);
    }, [activeCategory, activeSource, trimmedKeyword, onlyResults, pageSize]);

    const handleCategoryChange = (cat: CategoryFilter) => {
        setActiveCategory(cat);
        setActiveSource('all');
    };

    const visible = filtered.slice(0, visibleCount);
    const groups = groupByDate(visible);
    const remaining = filtered.length - visible.length;
    const resultCount = filteredBySource.filter(hasResults).length;

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

            {!loading && news.length > 0 && (
                <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
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

                    {/* 落札結果を追いたいときの絞り込み */}
                    <button
                        onClick={() => setOnlyResults(v => !v)}
                        className={`rounded-full border px-5 py-2 text-[10px] tracking-[0.2em] transition-all ${
                            onlyResults
                                ? 'border-accent bg-accent text-white shadow-sm'
                                : 'border-border/40 bg-white/40 text-secondary hover:border-accent/40 hover:text-accent'
                        }`}
                    >
                        落札・選定のみ（{resultCount}）
                    </button>
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
                            placeholder="業者名・発注者・キーワードで検索"
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

            {/* Source Filter（媒体が横に伸びるため一覧ページのみ） */}
            {detailed && !loading && news.length > 0 && (
                <div className="mb-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-b border-border/30 px-8 pb-5">
                    {(['all', ...sources]).map(src => {
                        const label = src === 'all' ? 'すべて' : (news.find(n => n.source === src)?.sourceLabel ?? src);
                        const count = src === 'all' ? filteredByCategory.length : filteredByCategory.filter(n => n.source === src).length;
                        const isActive = activeSource === src;
                        return (
                            <button
                                key={src}
                                onClick={() => setActiveSource(src)}
                                className="flex items-center gap-1.5 font-serif text-[10px] tracking-[0.25em] transition-all duration-300"
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
                            </button>
                        );
                    })}
                </div>
            )}

            <div className="mx-auto max-w-3xl">
                {loading && (
                    <div className="space-y-6">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="h-32 animate-pulse rounded-sm border border-border/20 bg-white/50" />
                        ))}
                    </div>
                )}

                {!loading && news.length === 0 && (
                    <p className="py-12 text-center font-serif text-sm tracking-widest text-secondary/40">
                        ニュースを取得できませんでした
                    </p>
                )}
                {!loading && news.length > 0 && filtered.length === 0 && (
                    <p className="py-12 text-center font-serif text-sm tracking-widest text-secondary/40">
                        {trimmedKeyword
                            ? `「${trimmedKeyword}」に一致するニュースは見つかりませんでした`
                            : onlyResults
                                ? '落札・選定の結果が出た記事はまだありません'
                                : '該当するニュースがありません'}
                    </p>
                )}

                {/* 日付ごとにまとめて表示 */}
                {!loading && groups.map(group => {
                    const heading = formatDateHeading(group.date);
                    return (
                        <div key={group.date || 'unknown'} className="mb-8">
                            <div className="flex items-baseline gap-3 border-b-2 border-primary/15 pb-2">
                                <h3 className="font-serif text-lg tracking-wider text-primary">{heading.main}</h3>
                                {heading.relative && (
                                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-accent">
                                        {heading.relative}
                                    </span>
                                )}
                                <span className="ml-auto font-serif text-[10px] tracking-widest text-secondary/40">
                                    {group.items.length}件
                                </span>
                            </div>
                            <div className="divide-y divide-border/30">
                                {group.items.map((item, index) => (
                                    <Article key={item.id} item={item} index={index} />
                                ))}
                            </div>
                        </div>
                    );
                })}

                {!loading && filtered.length > 0 && (
                    <div className="mt-8 flex flex-col items-center gap-3">
                        {remaining > 0 && (showAllLink ? (
                            <Link
                                href="/news"
                                className="flex items-center gap-2 rounded-full border border-border/40 bg-white/60 px-7 py-2.5 font-serif text-[11px] tracking-[0.2em] text-secondary transition-all hover:border-accent/40 hover:text-accent"
                            >
                                ニュースをすべて見る（他 {remaining} 件）
                                <ArrowRight size={13} />
                            </Link>
                        ) : (
                            <button
                                onClick={() => setVisibleCount(c => c + pageSize)}
                                className="rounded-full border border-border/40 bg-white/60 px-7 py-2.5 font-serif text-[11px] tracking-[0.2em] text-secondary transition-all hover:border-accent/40 hover:text-accent"
                            >
                                もっと見る（残り {remaining} 件）
                            </button>
                        ))}
                        <p className="font-serif text-[10px] tracking-widest text-secondary/40">
                            全 {filtered.length} 件中 {visible.length} 件を表示
                        </p>
                    </div>
                )}
            </div>
        </section>
    );
}

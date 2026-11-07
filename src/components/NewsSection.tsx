'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Bookmark, ChevronDown, Search, X } from 'lucide-react';
import Link from 'next/link';
import { groupNewsByTopic } from '@/lib/news_topics';
import { toggleSavedNews, useSavedNews } from '@/lib/saved_news';
import type { NewsItem } from '@/services/news_service';

/** "2026-08-16" をローカル日付として解釈する（new Date(str) はUTC扱いで前日にずれる） */
function parseLocalDate(dateStr: string): Date | null {
    const m = dateStr?.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
}

function isToday(d: Date): boolean {
    return d.toDateString() === new Date().toDateString();
}

function hasResults(item: NewsItem): boolean {
    return (item.results?.length ?? 0) > 0;
}

function ordererOf(item: NewsItem): string {
    return item.orderer && item.orderer !== item.sourceLabel ? item.orderer : '';
}

/** 1行1記事。見出しを読み比べやすいよう、抜粋は開いたときだけ出す */
function NewsRow({ item, related, saved, compact }: { item: NewsItem; related: NewsItem[]; saved: boolean; compact: boolean }) {
    const [open, setOpen] = useState(false);
    const date = parseLocalDate(item.date);
    const orderer = ordererOf(item);
    const media = item.publisher ?? item.sourceLabel;

    return (
        <li className={compact ? 'border-b border-border odd:bg-paper-stripe last:border-b-0' : 'border-b border-stone-200 last:border-b-0'}>
            <div className={`grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-start transition-colors ${compact
                ? 'gap-x-1.5 px-2.5 py-2 hover:bg-paper-tint'
                : 'gap-x-3 px-3 py-2.5 hover:bg-amber-50/60 lg:grid-cols-[2.75rem_6.5rem_minmax(0,1fr)_7.5rem_auto]'
            }`}>
                <span className={`pt-0.5 text-[13px] tabular-nums ${date && isToday(date) ? 'font-bold text-amber-700' : 'text-stone-500'}`}>
                    {date ? `${date.getMonth() + 1}/${date.getDate()}` : '-'}
                </span>

                {!compact && <span className="hidden truncate pt-0.5 text-[13px] font-bold text-stone-700 lg:block" title={orderer}>{orderer}</span>}

                <div className="min-w-0">
                    <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={compact ? 'text-sm leading-6 font-semibold break-words text-primary hover:text-accent hover:underline' : 'text-[15px] font-medium leading-6 text-stone-900 hover:text-amber-700 hover:underline'}
                    >
                        {item.title}
                    </a>
                    {related.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setOpen(value => !value)}
                            className="ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-xs font-bold text-stone-600 hover:bg-amber-100"
                        >
                            同じ話題 他{related.length}件
                        </button>
                    )}
                    <p className={`mt-0.5 text-xs ${compact ? 'break-words text-secondary' : 'truncate text-stone-500 lg:hidden'}`}>
                        {[orderer, media].filter(Boolean).join(' / ')}
                    </p>
                    {item.results?.map((result, index) => (
                        <p key={`${result.contractor}-${index}`} className="mt-0.5 text-[13px] font-bold text-emerald-800">
                            {result.kind} {result.contractor}{result.amount ? ` ${result.amount}` : ''}
                        </p>
                    ))}
                    {open && item.excerpt && (
                        <p className="mt-1.5 text-sm leading-6 text-stone-600">{item.excerpt}</p>
                    )}
                    {open && related.map(other => (
                        <a
                            key={other.link}
                            href={other.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1.5 block text-sm leading-6 text-stone-700 hover:text-amber-700 hover:underline"
                        >
                            {other.title}
                            <span className="ml-2 text-xs text-stone-500">{other.publisher ?? other.sourceLabel}</span>
                        </a>
                    ))}
                </div>

                {!compact && <span className="hidden truncate pt-0.5 text-xs text-stone-500 lg:block" title={media}>{media}</span>}

                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => setOpen(value => !value)}
                        disabled={!item.excerpt && related.length === 0}
                        aria-expanded={open}
                        aria-label={open ? '閉じる' : '抜粋を開く'}
                        title={open ? '閉じる' : '抜粋を開く'}
                        className="flex h-7 w-7 items-center justify-center rounded text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 disabled:invisible"
                    >
                        <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                    <button
                        type="button"
                        onClick={() => toggleSavedNews(item)}
                        aria-pressed={saved}
                        aria-label={saved ? '保存を解除' : '記事を保存'}
                        title={saved ? '保存を解除' : '記事を保存'}
                        className={`flex h-7 w-7 items-center justify-center rounded transition hover:bg-stone-100 ${saved ? 'text-amber-600' : 'text-stone-400 hover:text-stone-700'}`}
                    >
                        <Bookmark size={15} fill={saved ? 'currentColor' : 'none'} />
                    </button>
                </div>
            </div>
        </li>
    );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`h-9 shrink-0 rounded-lg border px-3 text-[13px] font-bold transition ${active
                ? 'border-amber-500 bg-amber-100 text-amber-900'
                : 'border-stone-300 bg-white text-stone-600 hover:border-amber-400'
            }`}
        >
            {children}
        </button>
    );
}

interface NewsSectionProps {
    /** 検索と絞り込みを出す（ニュース専用ページ用） */
    detailed?: boolean;
    /** 一度に表示する件数。「もっと見る」で同じ件数ずつ増える */
    pageSize?: number;
    /** ニュース一覧ページへの導線を出す（トップページ用） */
    showAllLink?: boolean;
    compact?: boolean;
}

export function NewsSection({ detailed = false, pageSize = 6, showAllLink = false, compact = false }: NewsSectionProps) {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeSource, setActiveSource] = useState<string>('all');
    const [onlyResults, setOnlyResults] = useState(false);
    const [onlySaved, setOnlySaved] = useState(false);
    const [keyword, setKeyword] = useState('');
    const [paging, setPaging] = useState({ filterKey: '', count: pageSize });
    const savedNews = useSavedNews();
    const savedLinks = new Set(savedNews.map(item => item.link));

    useEffect(() => {
        // ブラウザキャッシュが効くと古い記事のままになる
        fetch('/api/news', { cache: 'no-store' })
            .then(async res => {
                const data: unknown = await res.json();
                setNews(res.ok && Array.isArray(data) ? data : []);
            })
            .catch(() => setNews([]))
            .finally(() => setLoading(false));
    }, []);

    // 保存した記事は、一覧の保存期間を過ぎて消えたものも出す
    const base = onlySaved
        ? [...savedNews].sort((a, b) => b.date.localeCompare(a.date))
        : news;
    const sources = Array.from(new Set(news.map(n => n.source)));
    const trimmedKeyword = keyword.trim();
    const filtered = base.filter(n => {
        if (activeSource !== 'all' && n.source !== activeSource) return false;
        if (onlyResults && !hasResults(n)) return false;
        if (!trimmedKeyword) return true;
        const haystack = `${n.title} ${n.excerpt ?? ''} ${n.orderer ?? ''} ${(n.results ?? []).map(r => r.contractor).join(' ')}`;
        return haystack.includes(trimmedKeyword);
    });

    // 絞り込みを変えたら表示件数を初期値に戻す
    const filterKey = [activeSource, trimmedKeyword, onlyResults, onlySaved].join('|');
    const visibleCount = paging.filterKey === filterKey ? paging.count : pageSize;
    // 保存した記事は、ほかの記事の下に隠れないよう1件ずつ出す
    const rows = onlySaved ? filtered.map(item => [item]) : groupNewsByTopic(filtered);
    const visible = rows.slice(0, visibleCount);
    const remaining = rows.length - visible.length;

    return (
        <section className={compact ? 'paper-panel p-2.5' : 'mt-6'} id="news">
            {compact ? (
                <div className="paper-heading flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <h2>奈良の建設ニュース</h2>
                    <Link href="/news" className="inline-flex items-center gap-1 font-sans text-xs font-bold text-accent hover:underline">
                        一覧 <ArrowRight size={13} aria-hidden="true" />
                    </Link>
                </div>
            ) : !detailed && (
                <h2 className="mb-3 text-lg font-bold text-stone-900">奈良ニュース</h2>
            )}

            {detailed && !loading && news.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[14rem] flex-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                        <input
                            type="text"
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            placeholder="業者名・発注者・キーワードで検索"
                            className="h-9 w-full rounded-lg border border-stone-300 bg-white pl-9 pr-8 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:outline-none"
                        />
                        {keyword && (
                            <button
                                type="button"
                                onClick={() => setKeyword('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                                aria-label="検索をクリア"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                    <select
                        value={activeSource}
                        onChange={(e) => setActiveSource(e.target.value)}
                        aria-label="媒体で絞り込む"
                        className="h-9 rounded-lg border border-stone-300 bg-white px-2 text-[13px] text-stone-700 focus:border-amber-500 focus:outline-none"
                    >
                        <option value="all">すべての媒体（{news.length}）</option>
                        {sources.map(src => {
                            const items = news.filter(n => n.source === src);
                            return <option key={src} value={src}>{items[0].sourceLabel}（{items.length}）</option>;
                        })}
                    </select>
                    <FilterButton active={onlyResults} onClick={() => setOnlyResults(v => !v)}>
                        落札・選定（{news.filter(hasResults).length}）
                    </FilterButton>
                    <FilterButton active={onlySaved} onClick={() => setOnlySaved(v => !v)}>
                        保存した記事（{savedNews.length}）
                    </FilterButton>
                </div>
            )}

            {loading && (
                <div className={`${compact ? 'mt-2 h-20' : 'h-48'} animate-pulse rounded-xl border border-stone-200 bg-white/60`} />
            )}

            {!loading && news.length === 0 && !onlySaved && (
                <p className="py-10 text-center text-sm text-stone-500">ニュースを取得できませんでした</p>
            )}
            {!loading && (news.length > 0 || onlySaved) && filtered.length === 0 && (
                <p className="py-10 text-center text-sm text-stone-500">
                    {trimmedKeyword
                        ? `「${trimmedKeyword}」に一致するニュースは見つかりませんでした`
                        : onlySaved
                            ? '保存した記事はまだありません。記事の右端のしおりで保存できます'
                            : onlyResults
                                ? '落札・選定の結果が出た記事はまだありません'
                                : '該当するニュースがありません'}
                </p>
            )}

            {!loading && visible.length > 0 && (
                <ul className={compact ? 'mt-1' : 'overflow-hidden rounded-xl border border-stone-200 bg-white'}>
                    {visible.map(([item, ...related]) => (
                        <NewsRow key={item.link} item={item} related={related} saved={savedLinks.has(item.link)} compact={compact} />
                    ))}
                </ul>
            )}

            {!compact && !loading && filtered.length > 0 && (
                <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-xs text-stone-500">全 {rows.length} 件中 {visible.length} 件を表示</p>
                    {remaining > 0 && (showAllLink ? (
                        <Link href="/news" className="flex items-center gap-1 text-[13px] font-bold text-amber-700 hover:underline">
                            ニュースをすべて見る（他 {remaining} 件）
                            <ArrowRight size={13} />
                        </Link>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setPaging({ filterKey, count: visibleCount + pageSize })}
                            className="h-9 rounded-lg border border-stone-300 bg-white px-4 text-[13px] font-bold text-stone-600 transition hover:border-amber-400"
                        >
                            もっと見る（残り {remaining} 件）
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
}

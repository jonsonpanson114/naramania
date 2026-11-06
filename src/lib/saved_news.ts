'use client';

import { useSyncExternalStore } from 'react';
import type { NewsItem } from '@/services/news_service';

/**
 * 取っておいた記事。案件の保存と同じくブラウザに持つ。
 * 記事そのものを丸ごと保存するので、180日の保存期間を過ぎて一覧から消えても残る。
 */
export type SavedNewsItem = NewsItem & { savedAt: string };

const STORAGE_KEY = 'naramania_saved_news';
const CHANGE_EVENT = 'naramania-saved-news-change';
const EMPTY: SavedNewsItem[] = [];

let cachedRaw: string | null = null;
let cachedItems: SavedNewsItem[] = EMPTY;

function readSavedNews(): SavedNewsItem[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        // useSyncExternalStore は同じ中身なら同じ配列を返す必要がある
        if (raw === cachedRaw) return cachedItems;
        cachedRaw = raw;
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        cachedItems = Array.isArray(parsed) ? parsed as SavedNewsItem[] : EMPTY;
    } catch {
        cachedItems = EMPTY;
    }
    return cachedItems;
}

function subscribe(onChange: () => void): () => void {
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
        window.removeEventListener(CHANGE_EVENT, onChange);
        window.removeEventListener('storage', onChange);
    };
}

export function useSavedNews(): SavedNewsItem[] {
    return useSyncExternalStore(subscribe, readSavedNews, () => EMPTY);
}

export function toggleSavedNews(item: NewsItem): void {
    const current = readSavedNews();
    const next = current.some(saved => saved.link === item.link)
        ? current.filter(saved => saved.link !== item.link)
        : [{ ...item, savedAt: new Date().toISOString() }, ...current];
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        return;
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
}

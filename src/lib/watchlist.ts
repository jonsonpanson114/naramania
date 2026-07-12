'use client';

/**
 * 結果ウォッチ: 「この案件の開札結果だけ知りたい」という軽量フラグ。
 * 営業管理(naramania_saved)より軽い位置づけで、localStorage に ID のみ保存する。
 */

const WATCH_KEY = 'naramania_watches';
export const WATCH_CHANGE_EVENT = 'naramania-watch-change';

export function getWatchedIds(): string[] {
    if (typeof window === 'undefined') return [];
    try {
        const stored = localStorage.getItem(WATCH_KEY);
        const parsed = stored ? JSON.parse(stored) : [];
        return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
        return [];
    }
}

export function isWatched(id: string): boolean {
    return getWatchedIds().includes(id);
}

export function toggleWatch(id: string): boolean {
    const current = getWatchedIds();
    const next = current.includes(id)
        ? current.filter(watchedId => watchedId !== id)
        : [...current, id];
    localStorage.setItem(WATCH_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(WATCH_CHANGE_EVENT));
    return next.includes(id);
}

export function removeWatch(id: string): void {
    const next = getWatchedIds().filter(watchedId => watchedId !== id);
    localStorage.setItem(WATCH_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(WATCH_CHANGE_EVENT));
}

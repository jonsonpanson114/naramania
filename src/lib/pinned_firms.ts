'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'naramania_pinned_firms';
export const PINNED_FIRMS_EVENT = 'naramania:pinned-firms-changed';

export function getPinnedFirmKeys(): string[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
        return [];
    }
}

export function setPinnedFirmKeys(keys: string[]): void {
    if (typeof window === 'undefined') return;
    const unique = Array.from(new Set(keys));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
    window.dispatchEvent(new Event(PINNED_FIRMS_EVENT));
}

export function togglePinnedFirm(key: string): boolean {
    const current = getPinnedFirmKeys();
    const exists = current.includes(key);
    const next = exists ? current.filter(k => k !== key) : [...current, key];
    setPinnedFirmKeys(next);
    return !exists;
}

export function usePinnedFirms(): { pinnedKeys: string[]; isPinned: (key: string) => boolean; toggle: (key: string) => void } {
    const [pinnedKeys, setPinnedKeys] = useState<string[]>([]);

    useEffect(() => {
        const sync = () => setPinnedKeys(getPinnedFirmKeys());
        const timer = window.setTimeout(sync, 0);
        window.addEventListener(PINNED_FIRMS_EVENT, sync);
        window.addEventListener('storage', sync);
        return () => {
            window.clearTimeout(timer);
            window.removeEventListener(PINNED_FIRMS_EVENT, sync);
            window.removeEventListener('storage', sync);
        };
    }, []);

    return {
        pinnedKeys,
        isPinned: (key: string) => pinnedKeys.includes(key),
        toggle: (key: string) => {
            togglePinnedFirm(key);
        },
    };
}

'use client';

import { useMemo, useSyncExternalStore } from 'react';
import type { BiddingItem } from '@/types/bidding';

/**
 * 営業管理で「保存」した案件を読む。保存先はこのブラウザの localStorage だけ
 * （ProjectActionPanel と営業管理ページが同じキーに書く）。別の端末には出ない。
 */
export const SAVED_STORAGE_KEY = 'naramania_saved';

export type SalesStatus = 'pending' | 'active' | 'negotiating' | 'won' | 'lost';

export const SALES_STATUS_LABEL: Record<SalesStatus, string> = {
    pending: 'アプローチ前',
    active: '元請け営業中',
    negotiating: '見積提示中',
    won: '受注確定',
    lost: '失注',
};

export interface SavedItem extends BiddingItem {
    salesStatus?: SalesStatus;
}

function subscribe(onChange: () => void): () => void {
    // 別タブで保存したときに追従する。同じタブ内の保存はこのページからは起きない
    window.addEventListener('storage', onChange);
    return () => window.removeEventListener('storage', onChange);
}

function getSnapshot(): string {
    try {
        return window.localStorage.getItem(SAVED_STORAGE_KEY) ?? '';
    } catch {
        // localStorage が使えない環境（プライベートモードなど）では未保存と同じに扱う
        return '';
    }
}

// サーバーでは読めない。null は「まだ読んでいない」を表す
function getServerSnapshot(): null {
    return null;
}

export function parseSavedItems(raw: string): SavedItem[] {
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (entry): entry is SavedItem =>
                typeof entry === 'object'
                && entry !== null
                && typeof (entry as SavedItem).id === 'string'
                && typeof (entry as SavedItem).title === 'string',
        );
    } catch {
        return [];
    }
}

export function useSavedItems(): { ready: boolean; items: SavedItem[]; ids: Set<string> } {
    const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    return useMemo(() => {
        const items = parseSavedItems(raw ?? '');
        return { ready: raw !== null, items, ids: new Set(items.map(item => item.id)) };
    }, [raw]);
}

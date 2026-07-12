'use client';

import { useEffect, useState } from 'react';
import { Bell, BellRing } from 'lucide-react';
import { WATCH_CHANGE_EVENT, isWatched, toggleWatch } from '@/lib/watchlist';

/**
 * 結果ウォッチのトグルボタン。行リンクの中に置いても遷移しないよう
 * preventDefault / stopPropagation する。
 */
export function WatchButton({ itemId, compact = false }: { itemId: string; compact?: boolean }) {
    const [watched, setWatched] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => setWatched(isWatched(itemId)), 0);
        const sync = () => setWatched(isWatched(itemId));
        window.addEventListener(WATCH_CHANGE_EVENT, sync);
        return () => {
            window.clearTimeout(timer);
            window.removeEventListener(WATCH_CHANGE_EVENT, sync);
        };
    }, [itemId]);

    const handleClick = (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setWatched(toggleWatch(itemId));
    };

    if (compact) {
        return (
            <button
                type="button"
                onClick={handleClick}
                title={watched ? '結果ウォッチ中（クリックで解除）' : '開札結果をウォッチする'}
                aria-label={watched ? '結果ウォッチを解除' : '開札結果をウォッチ'}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${watched
                    ? 'border-amber-400 bg-amber-100 text-amber-700'
                    : 'border-stone-200 bg-white text-stone-300 hover:border-amber-300 hover:text-amber-600'
                }`}
            >
                {watched ? <BellRing size={14} /> : <Bell size={14} />}
            </button>
        );
    }

    return (
        <button
            type="button"
            onClick={handleClick}
            className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2 text-[11px] font-bold tracking-[0.12em] transition ${watched
                ? 'border-amber-400 bg-amber-100 text-amber-800 hover:bg-amber-200'
                : 'border-stone-200 bg-white text-stone-500 hover:border-amber-300 hover:text-amber-700'
            }`}
        >
            {watched ? <BellRing size={13} /> : <Bell size={13} />}
            {watched ? '結果ウォッチ中' : '結果をウォッチ'}
        </button>
    );
}

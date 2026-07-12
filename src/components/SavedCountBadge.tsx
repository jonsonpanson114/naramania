'use client';

import { useEffect, useState } from 'react';

/**
 * 営業管理(localStorage: naramania_saved)の件数をダッシュボードのカードに表示する。
 */
export function SavedCountBadge() {
    const [counts, setCounts] = useState<{ total: number; active: number } | null>(null);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            try {
                const stored = localStorage.getItem('naramania_saved');
                const parsed = stored ? JSON.parse(stored) : [];
                if (!Array.isArray(parsed)) return;
                const active = parsed.filter((item: { salesStatus?: string }) =>
                    item.salesStatus === 'active' || item.salesStatus === 'negotiating').length;
                setCounts({ total: parsed.length, active });
            } catch {
                // localStorageが壊れていても表示は諦めるだけ
            }
        }, 0);
        return () => window.clearTimeout(timer);
    }, []);

    if (!counts || counts.total === 0) {
        return <p className="mt-1 text-xs leading-5 text-secondary/55">保存案件とアプローチ状況</p>;
    }

    return (
        <p className="mt-1 text-xs leading-5 text-secondary/55">
            保存 <span className="font-bold tabular-nums text-sky-700">{counts.total}件</span>
            {counts.active > 0 && (
                <> / 営業中 <span className="font-bold tabular-nums text-sky-700">{counts.active}件</span></>
            )}
        </p>
    );
}

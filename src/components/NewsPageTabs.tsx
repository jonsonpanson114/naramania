'use client';

import { useState } from 'react';
import { NewsSection } from '@/components/NewsSection';
import { OsakaAwardsBoard } from '@/components/OsakaAwardsBoard';
import type { OsakaAwardRecord, OsakaSourceSummary } from '@/lib/osaka_awards_store';

interface NewsPageTabsProps {
    initialTab?: 'news' | 'osaka';
    initialOsakaScope?: 'nara' | 'all';
    osakaRecords: OsakaAwardRecord[];
    osakaSummaries: OsakaSourceSummary[];
    osakaGeneratedAt: string | null;
}

export function NewsPageTabs({
    initialTab = 'news',
    initialOsakaScope = 'nara',
    osakaRecords,
    osakaSummaries,
    osakaGeneratedAt,
}: NewsPageTabsProps) {
    const [tab, setTab] = useState<'news' | 'osaka'>(initialTab);
    const naraHitCount = osakaRecords.filter(r => r.isNaraFirm).length;

    return (
        <div>
            <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-stone-200 pb-3">
                <button
                    type="button"
                    onClick={() => setTab('news')}
                    className={`rounded-lg border px-4 py-2 text-sm font-bold transition ${
                        tab === 'news'
                            ? 'border-amber-500 bg-amber-100 text-amber-950'
                            : 'border-stone-300 bg-white text-stone-700 hover:border-amber-400'
                    }`}
                >
                    建設ニュース・記事
                </button>
                <button
                    type="button"
                    onClick={() => setTab('osaka')}
                    className={`rounded-lg border px-4 py-2 text-sm font-bold transition ${
                        tab === 'osaka'
                            ? 'border-sky-500 bg-sky-100 text-sky-950'
                            : 'border-stone-300 bg-white text-stone-700 hover:border-sky-400'
                    }`}
                >
                    大阪の設計入札結果（奈良 {naraHitCount} / 全 {osakaRecords.length}）
                </button>
            </div>

            {tab === 'news' ? (
                <NewsSection detailed pageSize={50} />
            ) : (
                <OsakaAwardsBoard
                    records={osakaRecords}
                    summaries={osakaSummaries}
                    generatedAt={osakaGeneratedAt}
                    initialScope={initialOsakaScope}
                />
            )}
        </div>
    );
}

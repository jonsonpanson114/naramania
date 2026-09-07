import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { BiddingItem } from '@/types/bidding';
import { matchesViewTab } from '@/lib/practical_filters';
import { assessBiddingScope } from '@/lib/relevance_guard';

/**
 * トップから案件一覧(検索画面)へ渡すための導線。
 *
 * 以前はトップに全案件表をそのまま再掲載しており、モバイルで
 * ページ全体 14,070px(17画面分)のうち 10,774px をこの表が占めていた。
 * 上部の「TODAY FOCUS」で要点は足りているので、トップでは件数だけ見せて
 * 実際の絞り込みは検索画面に集約する。
 */

type Entry = {
    label: string;
    quick: string;
    count: number;
    hint: string;
};

export function ProjectListLink({ items }: { items: BiddingItem[] }) {
    // 遷移先の一覧は既定でノイズ案件を隠すため、ここも同じ集合で数える。
    // 揃えないとトップが「結果270件」、開くと248件になり数字が信用されなくなる。
    const scopedItems = items.filter(item => assessBiddingScope(item).status !== 'noise');

    const entries: Entry[] = [
        {
            label: '受付中',
            quick: 'active',
            count: scopedItems.filter(item => matchesViewTab(item, 'active')).length,
            hint: '今すぐ追える案件',
        },
        {
            label: '追跡待ち',
            quick: 'resultFollowUp',
            count: scopedItems.filter(item => matchesViewTab(item, 'followUp')).length,
            hint: '開札済みで結果未確定',
        },
        {
            label: '結果',
            quick: 'opened',
            count: scopedItems.filter(item => matchesViewTab(item, 'results')).length,
            hint: '落札・不調が確定',
        },
    ];

    return (
        <section className="mt-10">
            <div className="rounded-2xl border border-stone-200 bg-white/80 p-5 shadow-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-lg font-bold tracking-[0.08em] text-primary">案件一覧</h2>
                    <Link
                        href="/search?quick=all"
                        className="inline-flex items-center gap-1.5 text-[13px] font-bold tracking-[0.08em] text-accent transition hover:opacity-70"
                    >
                        すべて見る（{scopedItems.length}件）
                        <ArrowRight size={14} />
                    </Link>
                </div>
                <p className="mt-2 text-[13px] leading-6 tracking-wider text-secondary/60">
                    キーワードや自治体での絞り込みは検索画面にまとめています。
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {entries.map(entry => (
                        <Link
                            key={entry.quick}
                            href={`/search?quick=${entry.quick}`}
                            className="rounded-xl border border-stone-200 bg-white p-4 transition hover:border-accent/40 hover:shadow-md"
                        >
                            <p className="text-[13px] font-bold tracking-[0.08em] text-primary">{entry.label}</p>
                            <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-primary">
                                {entry.count}
                            </p>
                            <p className="mt-1 text-[11px] tracking-wider text-secondary/55">{entry.hint}</p>
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    );
}

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { MAP_TITLE, OPEN_BIDS, PROPO_ROWS, YEAR_ITEMS } from '@/data/design_map';

/**
 * トップから設計案件マップ(/design-map)へ渡すための入口。
 * 件数と調査日はマップのデータから数える。ここに数字を直接書くと、
 * 月ごとの更新でマップだけ変わって入口の数字が古くなる。
 */
export function DesignMapEntry() {
    const surveyDate = MAP_TITLE.meta.find(entry => entry.k === '調査日')?.v;
    const openPropoCount = PROPO_ROWS.filter(row => row.status === '募集中').length;

    return (
        <section className="paper-panel" aria-labelledby="design-map-entry">
            <div className="home-section-heading">
                <h2 id="design-map-entry">設計案件マップ</h2>
                {surveyDate ? <span>調査日 {surveyDate}</span> : null}
            </div>
            <p className="px-4 pt-3 text-sm leading-6 text-secondary">
                これから出る設計と、今年出た設計、プロポの動きを1枚にまとめています。保存した案件も並びます。
            </p>
            <dl className="grid grid-cols-3 gap-2 px-4 py-3 text-center">
                <div className="rounded-md border border-border px-2 py-2">
                    <dt className="text-xs text-secondary">公告中</dt>
                    <dd className="text-xl font-bold tabular-nums">{OPEN_BIDS.length}<span className="text-xs font-normal">件</span></dd>
                </div>
                <div className="rounded-md border border-border px-2 py-2">
                    <dt className="text-xs text-secondary">募集中のプロポ</dt>
                    <dd className="text-xl font-bold tabular-nums">{openPropoCount}<span className="text-xs font-normal">件</span></dd>
                </div>
                <div className="rounded-md border border-border px-2 py-2">
                    <dt className="text-xs text-secondary">今年の設計</dt>
                    <dd className="text-xl font-bold tabular-nums">{YEAR_ITEMS.length}<span className="text-xs font-normal">件</span></dd>
                </div>
            </dl>
            <Link href="/design-map" className="flex w-fit items-center gap-1.5 rounded px-4 pt-1 pb-3 text-sm font-bold text-accent hover:underline">
                マップを開く <ArrowRight size={14} aria-hidden="true" />
            </Link>
        </section>
    );
}

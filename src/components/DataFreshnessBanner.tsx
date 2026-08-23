import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { getDataFreshness } from '@/lib/data_freshness';

/**
 * データの収集が止まっていることを画面上部で知らせる。
 *
 * 収集が失敗するとcommit/pushまで到達せずデータが更新されなくなるが、
 * 以前は画面最下部に「データ更新: 8/19」と日付が出るだけで、
 * それが古いことを判定していなかったため2日間気づけなかった。
 * 気づけることが目的なので、最下部ではなく最上部に置く。
 */
export function DataFreshnessBanner({ generatedAt }: { generatedAt?: string | null }) {
    const freshness = getDataFreshness(generatedAt);
    if (!freshness.isStale || !freshness.lastUpdated) return null;

    const lastUpdatedLabel = freshness.lastUpdated.toLocaleString('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

    return (
        <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                    <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" />
                    <div>
                        <p className="text-[15px] font-bold tracking-[0.04em]">{freshness.message}</p>
                        <p className="mt-1 text-[13px] text-amber-800/80">
                            最終更新 {lastUpdatedLabel}　表示中の案件は最新でない可能性があります。
                        </p>
                    </div>
                </div>
                <Link
                    href="/admin"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-400 bg-white px-4 py-2 text-[12px] font-bold tracking-[0.1em] transition hover:bg-amber-100"
                >
                    収集状況を確認
                    <ArrowRight size={13} />
                </Link>
            </div>
        </div>
    );
}

import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { getDataFreshness, getStaleMunicipalities } from '@/lib/data_freshness';

/**
 * データの収集が止まっていることを画面上部で知らせる。
 *
 * 収集が失敗するとcommit/pushまで到達せずデータが更新されなくなるが、
 * 以前は画面最下部に「データ更新: 8/19」と日付が出るだけで、
 * それが古いことを判定していなかったため2日間気づけなかった。
 * 気づけることが目的なので、最下部ではなく最上部に置く。
 *
 * 全体の停止と、自治体単位の停止の両方を見る。奈良県は別ワークフロー
 * (平日22:00・自前ランナー)で動くため、Daily Scrapeが毎日成功していても
 * 奈良県だけ止まることがあり、全体の鮮度だけでは検知できない。
 */
export function DataFreshnessBanner({
    generatedAt,
    municipalityLastScraped,
}: {
    generatedAt?: string | null;
    municipalityLastScraped?: Record<string, string> | null;
}) {
    const freshness = getDataFreshness(generatedAt);
    const staleMunicipalities = getStaleMunicipalities(municipalityLastScraped);

    if (!freshness.isStale && staleMunicipalities.length === 0) return null;

    const formatDateTime = (date: Date) => date.toLocaleString('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

    const unknown = staleMunicipalities.filter(entry => entry.status === 'unknown');

    // 全体が止まっていればそちらを主見出しに、そうでなければ自治体単位の異常を伝える。
    // 「状態不明」を「更新されていません」と一緒くたにすると、収集できているのに
    // 記録が無いだけなのか、そもそも一度も取れていないのかが区別できないため分ける。
    const headline = freshness.isStale && freshness.message
        ? freshness.message
        : unknown.length > 0
            ? unknown.length === 1
                ? `${unknown[0].municipality}の収集状況が確認できません。表示中の案件は古い可能性があります。`
                : `${unknown.length}自治体の収集状況が確認できません。表示中の案件は古い可能性があります。`
            : staleMunicipalities.length === 1
                ? `${staleMunicipalities[0].municipality}のデータが更新されていません。`
                : `${staleMunicipalities.length}自治体のデータが更新されていません。`;

    return (
        <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                    <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" />
                    <div>
                        <p className="text-[15px] font-bold tracking-[0.04em]">{headline}</p>
                        {freshness.isStale && freshness.lastUpdated && (
                            <p className="mt-1 text-[13px] text-amber-800/80">
                                最終更新 {formatDateTime(freshness.lastUpdated)}　表示中の案件は最新でない可能性があります。
                            </p>
                        )}
                        {staleMunicipalities.length > 0 && (
                            <ul className="mt-1 space-y-0.5 text-[13px] text-amber-800/80">
                                {staleMunicipalities.slice(0, 4).map(entry => (
                                    <li key={entry.municipality}>
                                        {entry.lastUpdated
                                            ? `${entry.municipality}: 最終収集 ${formatDateTime(entry.lastUpdated)}`
                                            : `${entry.municipality}: 最終収集の記録なし（収集できているか不明）`}
                                    </li>
                                ))}
                                {staleMunicipalities.length > 4 && (
                                    <li>ほか {staleMunicipalities.length - 4} 自治体</li>
                                )}
                            </ul>
                        )}
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

import type { RejectedItemsReport } from '@/lib/dashboard_data';
import { FileWarning, ShieldAlert, Sparkles } from 'lucide-react';

const REASON_LABELS: Record<string, string> = {
    always_exclude_keyword: '除外キーワード',
    exclusion_keyword: '土木・測量・物品系',
    no_architecture_context: '建築文脈なし',
    infra_exclude_keyword: 'インフラ系',
    stale_date: '古い日付',
};

function formatGeneratedAt(value?: string): string {
    if (!value) return '未実行';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function RejectedItemsPanel({ report }: { report: RejectedItemsReport | null }) {
    if (!report) {
        return (
            <section className="rounded-[2rem] border border-stone-200/80 bg-white p-6 shadow-sm lg:p-8" aria-label="除外ログ">
                <div className="flex items-center gap-3">
                    <FileWarning size={18} className="text-stone-400" />
                    <p className="text-sm text-stone-500">除外ログ(rejected_items_report.json)はまだ生成されていません。次回のスクレイプ実行後に表示されます。</p>
                </div>
            </section>
        );
    }

    const municipalityRows = Object.entries(report.byMunicipality)
        .map(([municipality, counts]) => ({ municipality, ...counts }))
        .sort((a, b) => (b.rejected + b.borderlineRescued) - (a.rejected + a.borderlineRescued));

    const reasonCounts = report.entries
        .filter((entry) => !entry.borderlineRescue)
        .reduce<Record<string, number>>((acc, entry) => {
            acc[entry.reason] = (acc[entry.reason] || 0) + 1;
            return acc;
        }, {});

    const borderlineEntries = report.entries.filter((entry) => entry.borderlineRescue).slice(0, 12);

    return (
        <section className="rounded-[2rem] border border-stone-200/80 bg-white p-6 shadow-sm lg:p-8" aria-label="除外ログ">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[10px] font-bold tracking-[0.22em] text-rose-700 uppercase">
                        <ShieldAlert size={14} />
                        Rejection Log
                    </div>
                    <h3 className="mt-4 text-2xl font-light tracking-[0.08em] text-primary">フィルタで捨てた案件</h3>
                    <p className="mt-3 max-w-2xl text-sm leading-7 tracking-[0.04em] text-secondary/65">
                        「採用した案件」は一覧で見えるが、「捨てた案件」はこれまでどこにも残らず、
                        安堵町のこども園案件が丸ごと除外されても6週間気づけなかった。ここで自治体ごとの除外数を毎日確認できる。
                    </p>
                    <p className="mt-2 text-xs tracking-[0.08em] text-secondary/40">最終更新: {formatGeneratedAt(report.generatedAt)}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-2xl border border-stone-200 bg-stone-50 p-2 text-center sm:min-w-[280px]">
                    <div className="rounded-xl bg-white px-3 py-3">
                        <p className="text-[9px] tracking-[0.18em] text-secondary/40 uppercase">除外</p>
                        <p className="mt-1 text-xl tabular-nums text-rose-700">{report.totalRejected}</p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-3">
                        <p className="text-[9px] tracking-[0.18em] text-secondary/40 uppercase">際どく救済</p>
                        <p className="mt-1 text-xl tabular-nums text-amber-700">{report.totalBorderlineRescued}</p>
                    </div>
                </div>
            </div>

            {municipalityRows.length > 0 && (
                <div className="mt-6 overflow-x-auto rounded-2xl border border-stone-200">
                    <table className="w-full min-w-[420px] text-sm">
                        <thead>
                            <tr className="border-b border-stone-200 bg-stone-50 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">
                                <th className="px-4 py-3 text-left">自治体</th>
                                <th className="px-4 py-3 text-right">除外</th>
                                <th className="px-4 py-3 text-right">際どく救済</th>
                            </tr>
                        </thead>
                        <tbody>
                            {municipalityRows.map((row) => (
                                <tr key={row.municipality} className="border-b border-stone-100 last:border-b-0">
                                    <td className="px-4 py-2.5 font-bold text-stone-800">{row.municipality}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums text-rose-700">{row.rejected || '-'}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums text-amber-700">{row.borderlineRescued || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {Object.keys(reasonCounts).length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                    {Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).map(([reason, count]) => (
                        <span key={reason} className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-[11px] font-bold text-stone-600">
                            {REASON_LABELS[reason] || reason}: {count}
                        </span>
                    ))}
                </div>
            )}

            {borderlineEntries.length > 0 && (
                <div className="mt-6">
                    <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">
                        <Sparkles size={14} />
                        際どく救済した案件（除外語に当たったが学校・こども園等の文脈で残した）
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {borderlineEntries.map((entry, index) => (
                            <div key={`${entry.title}-${index}`} className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
                                <div className="flex items-center justify-between gap-2 text-[10px] font-bold tracking-[0.1em] text-amber-700">
                                    <span>{entry.municipality || '自治体不明'}</span>
                                    <span>{entry.matchedKeywords.join(', ')}</span>
                                </div>
                                <p className="mt-1.5 line-clamp-2 text-xs leading-6 text-stone-800">{entry.title}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}

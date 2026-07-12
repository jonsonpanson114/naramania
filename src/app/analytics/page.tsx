import { BiddingItem, Municipality, BiddingType } from '@/types/bidding';
import { AppShell } from '@/components/AppShell';
import RankingChart from '@/components/RankingChart';
import RadarChart from '@/components/RadarChart';
import { loadDashboardData } from '@/lib/dashboard_data';

interface ScatterDataPoint {
    name: string;
    municipality: Municipality;
    price: number;
    priceLabel: string;
    contractor: string;
    type: BiddingType;
}

// Convert "12,345,000円" to 12345000
function parsePrice(priceStr?: string): number | null {
    if (!priceStr) return null;
    const clean = priceStr.replace(/[^0-9]/g, '');
    const num = parseInt(clean, 10);
    return isNaN(num) ? null : num;
}

function formatCurrency(val: number): string {
    if (val >= 100000000) return `${(val / 100000000).toFixed(1)}億円`;
    if (val >= 10000) return `${(val / 10000).toLocaleString()}万円`;
    return `${val}円`;
}

export default async function AnalyticsPage() {
    const { allItems: items } = loadDashboardData();

    // --- 落札実績ランキング ---
    const contractorStats: Record<string, { count: number, totalAmount: number }> = {};
    const designStats: Record<string, { count: number, totalAmount: number }> = {};

    const parseAmount = (price: string | undefined): number => {
        if (!price) return 0;
        const normalized = price.replace(/[^\d]/g, '');
        return parseInt(normalized) || 0;
    };

    items.forEach((item: BiddingItem) => {
        if (item.winningContractor) {
            const stats = contractorStats[item.winningContractor] || { count: 0, totalAmount: 0 };
            stats.count += 1;
            stats.totalAmount += parseAmount(item.estimatedPrice);
            contractorStats[item.winningContractor] = stats;
        }
        if (item.designFirm) {
            const stats = designStats[item.designFirm] || { count: 0, totalAmount: 0 };
            stats.count += 1;
            stats.totalAmount += parseAmount(item.estimatedPrice);
            designStats[item.designFirm] = stats;
        }
    });

    const topContractorsByCount = Object.entries(contractorStats)
        .map(([name, stats]) => ({ name, count: stats.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    const topContractorsByAmount = Object.entries(contractorStats)
        .map(([name, stats]) => ({ name, amount: stats.totalAmount, count: stats.count }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);

    const topDesignFirmsByCount = Object.entries(designStats)
        .map(([name, stats]) => ({ name, count: stats.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    // --- 価格相場 ---
    const scatterData: ScatterDataPoint[] = items.map((item: BiddingItem) => {
        const price = parsePrice(item.estimatedPrice);
        if (!price) return null;

        return {
            name: item.title,
            municipality: item.municipality,
            price: price,
            priceLabel: item.estimatedPrice ?? '',
            contractor: item.winningContractor || '未定',
            type: item.type,
        };
    }).filter((i): i is ScatterDataPoint => i !== null);

    scatterData.sort((a, b) => b.price - a.price);

    const totalWithPrice = scatterData.length;
    const avgPrice = totalWithPrice > 0
        ? Math.round(scatterData.reduce((acc, curr) => acc + curr.price, 0) / totalWithPrice)
        : 0;
    const maxItem = scatterData[0];

    // --- 自治体別の動き ---
    const municipalityStats = new Map<string, { total: number; active: number; awarded: number; failed: number }>();
    items.forEach((item) => {
        const stats = municipalityStats.get(item.municipality) || { total: 0, active: 0, awarded: 0, failed: 0 };
        stats.total += 1;
        if (item.status === '受付中') stats.active += 1;
        if (item.status === '落札') stats.awarded += 1;
        if (item.status === '不調') stats.failed += 1;
        municipalityStats.set(item.municipality, stats);
    });
    const municipalityRows = Array.from(municipalityStats.entries())
        .map(([municipality, stats]) => ({
            municipality,
            ...stats,
            failRate: stats.awarded + stats.failed > 0
                ? Math.round((stats.failed / (stats.awarded + stats.failed)) * 100)
                : null,
        }))
        .sort((a, b) => b.total - a.total);

    // 月×自治体マトリクス（直近6ヶ月・公告日ベース）
    const now = new Date();
    const months: string[] = [];
    for (let i = 5; i >= 0; i -= 1) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const heatMunicipalities = municipalityRows.slice(0, 12).map(row => row.municipality);
    const monthCounts = new Map<string, number>();
    items.forEach((item) => {
        const month = (item.announcementDate || '').slice(0, 7);
        if (!months.includes(month)) return;
        const key = `${item.municipality}:${month}`;
        monthCounts.set(key, (monthCounts.get(key) || 0) + 1);
    });
    const maxMonthCount = Math.max(1, ...Array.from(monthCounts.values()));

    const heatColor = (count: number): string => {
        if (count === 0) return 'bg-stone-50 text-stone-300';
        const ratio = count / maxMonthCount;
        if (ratio > 0.66) return 'bg-amber-500 text-white';
        if (ratio > 0.33) return 'bg-amber-300 text-stone-900';
        return 'bg-amber-100 text-stone-700';
    };

    return (
        <AppShell>
            <div className="space-y-12">
                <div>
                    <h1 className="text-3xl font-light tracking-[0.08em] text-primary font-serif mb-2">分析</h1>
                    <p className="text-secondary/60 text-sm tracking-wider">
                        落札実績のランキングと価格相場をまとめた分析ページです。
                    </p>
                </div>

                {/* 自治体別の動き */}
                <section aria-label="自治体別の動き">
                    <h2 className="text-xl font-bold text-gray-900 mb-6">自治体別の動き</h2>

                    <div className="bg-white rounded-3xl p-6 border border-amber-900/10 shadow-sm overflow-x-auto mb-6">
                        <h3 className="text-sm font-bold text-gray-700 mb-4">月別の公告件数（直近6ヶ月・上位{heatMunicipalities.length}自治体）</h3>
                        <table className="w-full min-w-[560px] border-separate border-spacing-1 text-center">
                            <thead>
                                <tr>
                                    <th className="text-left text-[11px] font-bold text-gray-400 px-2">自治体</th>
                                    {months.map(month => (
                                        <th key={month} className="text-[11px] font-bold text-gray-400 px-1 tabular-nums">
                                            {Number(month.slice(5, 7))}月
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {heatMunicipalities.map(municipality => (
                                    <tr key={municipality}>
                                        <td className="text-left text-xs font-bold text-gray-700 px-2 whitespace-nowrap">{municipality}</td>
                                        {months.map(month => {
                                            const count = monthCounts.get(`${municipality}:${month}`) || 0;
                                            return (
                                                <td key={month} className={`rounded-lg py-2 text-xs font-bold tabular-nums ${heatColor(count)}`}>
                                                    {count > 0 ? count : ''}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="bg-white rounded-3xl p-6 border border-amber-900/10 shadow-sm overflow-x-auto">
                        <h3 className="text-sm font-bold text-gray-700 mb-4">掲載・落札・不調の内訳（不調率 = 不調 ÷ 開札結果）</h3>
                        <table className="w-full min-w-[480px] text-sm">
                            <thead>
                                <tr className="text-[11px] font-bold text-gray-400 border-b border-gray-100">
                                    <th className="text-left py-2 px-2">自治体</th>
                                    <th className="text-right py-2 px-2">掲載</th>
                                    <th className="text-right py-2 px-2">受付中</th>
                                    <th className="text-right py-2 px-2">落札</th>
                                    <th className="text-right py-2 px-2">不調</th>
                                    <th className="text-right py-2 px-2">不調率</th>
                                </tr>
                            </thead>
                            <tbody>
                                {municipalityRows.map(row => (
                                    <tr key={row.municipality} className="border-b border-gray-50 hover:bg-amber-50/40">
                                        <td className="py-2 px-2 font-bold text-gray-800">{row.municipality}</td>
                                        <td className="py-2 px-2 text-right tabular-nums text-gray-600">{row.total}</td>
                                        <td className="py-2 px-2 text-right tabular-nums text-sky-700">{row.active || ''}</td>
                                        <td className="py-2 px-2 text-right tabular-nums text-emerald-700">{row.awarded || ''}</td>
                                        <td className="py-2 px-2 text-right tabular-nums text-amber-700">{row.failed || ''}</td>
                                        <td className={`py-2 px-2 text-right tabular-nums font-bold ${row.failRate !== null && row.failRate >= 30 ? 'text-rose-600' : 'text-gray-500'}`}>
                                            {row.failRate !== null ? `${row.failRate}%` : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* 落札実績ランキング */}
                <section aria-label="落札実績ランキング">
                    <h2 className="text-xl font-bold text-gray-900 mb-6">落札実績ランキング</h2>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="space-y-8">
                            <div className="bg-white rounded-3xl p-8 border border-amber-900/10 shadow-sm">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                        <span className="text-2xl">🏗️</span> 受注件数（ゼネコン）
                                    </h3>
                                    <span className="text-[10px] bg-amber-50 text-amber-600 px-3 py-1 rounded-full border border-amber-100 font-bold uppercase tracking-widest">Count Ranking</span>
                                </div>
                                {topContractorsByCount.length > 0 ? (
                                    <RankingChart data={topContractorsByCount} color="#d97706" />
                                ) : (
                                    <p className="text-gray-500 text-sm italic">NO DATA AVAILABLE</p>
                                )}
                            </div>

                            <div className="bg-white rounded-3xl p-8 border border-indigo-900/10 shadow-sm">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                        <span className="text-2xl">💰</span> 受注金額（推計合計）
                                    </h3>
                                    <span className="text-[10px] bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full border border-indigo-100 font-bold uppercase tracking-widest">Revenue Ranking</span>
                                </div>
                                <div className="space-y-4">
                                    {topContractorsByAmount.map((c, i) => (
                                        <div key={c.name} className="flex items-center group">
                                            <div className="w-8 text-xl font-serif italic text-gray-300 group-hover:text-indigo-600 transition-colors">{i + 1}</div>
                                            <div className="flex-1 bg-gray-50/50 p-3 rounded-lg border border-gray-100 group-hover:bg-indigo-50/30 group-hover:border-indigo-100 transition-all flex justify-between items-center">
                                                <span className="text-sm font-serif font-bold text-gray-800">{c.name}</span>
                                                <div className="text-right">
                                                    <div className="text-xs font-bold text-indigo-600 font-sans">{formatCurrency(c.amount)}</div>
                                                    <div className="text-[8px] text-gray-400 font-sans uppercase tracking-tighter">{c.count} PROJECTS</div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-8">
                            <div className="bg-white rounded-3xl p-8 border border-emerald-900/10 shadow-sm">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                        <span className="text-2xl">📐</span> 設計回数（事務所）
                                    </h3>
                                    <span className="text-[10px] bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full border border-emerald-100 font-bold uppercase tracking-widest">Consulting Count</span>
                                </div>
                                {topDesignFirmsByCount.length > 0 ? (
                                    <RankingChart data={topDesignFirmsByCount} color="#059669" />
                                ) : (
                                    <p className="text-gray-500 text-sm italic">NO DATA AVAILABLE</p>
                                )}
                            </div>
                        </div>
                    </div>
                </section>

                {/* 価格相場 */}
                <section aria-label="価格相場">
                    <h2 className="text-xl font-bold text-gray-900 mb-6">価格相場</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div className="bg-white rounded-3xl p-6 border border-amber-900/10 shadow-sm flex flex-col justify-center">
                            <p className="text-sm text-gray-500 font-medium mb-1">解析完了データ数</p>
                            <p className="text-4xl font-extrabold text-amber-900">{totalWithPrice}<span className="text-lg text-gray-400 font-medium ml-1">件</span></p>
                        </div>
                        <div className="bg-white rounded-3xl p-6 border border-amber-900/10 shadow-sm flex flex-col justify-center">
                            <p className="text-sm text-gray-500 font-medium mb-1">平均予定価格</p>
                            <p className="text-3xl font-extrabold text-indigo-900">
                                {new Intl.NumberFormat('ja-JP').format(avgPrice)}<span className="text-lg text-gray-400 font-medium ml-1">円</span>
                            </p>
                        </div>
                        <div className="bg-white rounded-3xl p-6 border border-emerald-900/10 shadow-sm flex flex-col justify-center">
                            <p className="text-sm text-gray-500 font-medium mb-1">最高額トップ案件</p>
                            <p className="text-xl font-extrabold text-emerald-900 truncate" title={maxItem?.name || ''}>
                                {maxItem ? `${new Intl.NumberFormat('ja-JP').format(maxItem.price)}円` : '-'}
                            </p>
                            <p className="text-xs text-gray-400 mt-1 truncate">{maxItem?.municipality} | {maxItem?.contractor}</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl p-8 border border-amber-900/10 shadow-sm">
                        <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                            <span className="text-2xl">📊</span> 案件規模の分布チャート
                        </h3>
                        {scatterData.length > 0 ? (
                            <RadarChart data={scatterData} />
                        ) : (
                            <div className="h-64 flex items-center justify-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                                <p className="text-gray-400 font-medium">価格データが存在しません。PDF解析を実行してください。</p>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </AppShell>
    );
}

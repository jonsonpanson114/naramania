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

    return (
        <AppShell>
            <div className="space-y-12">
                <div>
                    <h1 className="text-3xl font-light tracking-[0.08em] text-primary font-serif mb-2">分析</h1>
                    <p className="text-secondary/60 text-sm tracking-wider">
                        落札実績のランキングと価格相場をまとめた分析ページです。
                    </p>
                </div>

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

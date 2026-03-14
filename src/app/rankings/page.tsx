import fs from 'fs';
import path from 'path';
import { BiddingItem } from '../../types/bidding';
import RankingChart from '@/components/RankingChart';

export default async function RankingsPage() {
    // Read local JSON file for the data source
    const resultPath = path.join(process.cwd(), 'scraper_result.json');
    let items: BiddingItem[] = [];
    if (fs.existsSync(resultPath)) {
        items = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    }

    // Process Rankings
    const contractorStats: Record<string, { count: number, totalAmount: number }> = {};
    const designStats: Record<string, { count: number, totalAmount: number }> = {};

    const parseAmount = (price: string | undefined): number => {
        if (!price) return 0;
        const normalized = price.replace(/[^\d]/g, '');
        return parseInt(normalized) || 0;
    };

    items.forEach(item => {
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

    const formatCurrency = (val: number) => {
        if (val >= 100000000) return `${(val / 100000000).toFixed(1)}億円`;
        if (val >= 10000) return `${(val / 10000).toLocaleString()}万円`;
        return `${val}円`;
    };

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

    return (
        <div className="space-y-12 animate-fade-in-up">
            <div>
                <h1 className="text-3xl font-black text-gray-900 mb-2">落札実績ランキング</h1>
                <p className="text-gray-500">AIが抽出した全自治体の落札データから、受注回数の多い企業・事務所を分析します。</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                {/* Contractors Count Column */}
                <div className="space-y-8">
                    <div className="bg-white rounded-3xl p-8 border border-amber-900/10 shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                <span className="text-2xl">🏗️</span> 受注件数（ゼネコン）
                            </h2>
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
                            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                <span className="text-2xl">💰</span> 受注金額（推計合計）
                            </h2>
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

                {/* Design Firms Column */}
                <div className="space-y-8">
                    <div className="bg-white rounded-3xl p-8 border border-emerald-900/10 shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                <span className="text-2xl">📐</span> 設計回数（事務所）
                            </h2>
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
        </div>
    );
}

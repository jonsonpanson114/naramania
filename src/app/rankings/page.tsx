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

    // Process Top Contractors
    const contractorCounts: Record<string, number> = {};
    const designCounts: Record<string, number> = {};

    items.forEach(item => {
        if (item.winningContractor) {
            contractorCounts[item.winningContractor] = (contractorCounts[item.winningContractor] || 0) + 1;
        }
        if (item.designFirm) {
            designCounts[item.designFirm] = (designCounts[item.designFirm] || 0) + 1;
        }
    });

    const topContractors = Object.entries(contractorCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Top 10

    const topDesignFirms = Object.entries(designCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Top 10

    return (
        <div className="space-y-12 animate-fade-in-up">
            <div>
                <h1 className="text-3xl font-black text-gray-900 mb-2">落札実績ランキング</h1>
                <p className="text-gray-500">AIが抽出した全自治体の落札データから、受注回数の多い企業・事務所を分析します。</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Contractors Card */}
                <div className="bg-white rounded-3xl p-8 border border-amber-900/10 shadow-sm">
                    <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                        <span className="text-2xl">🏗️</span> トップゼネコン（施工）
                    </h2>
                    {topContractors.length > 0 ? (
                        <RankingChart data={topContractors} color="#d97706" />
                    ) : (
                        <p className="text-gray-500 text-sm">データが不足しています。PDF解析を実行してください。</p>
                    )}
                </div>

                {/* Design Firms Card */}
                <div className="bg-white rounded-3xl p-8 border border-amber-900/10 shadow-sm">
                    <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                        <span className="text-2xl">📐</span> トップ設計事務所（委託）
                    </h2>
                    {topDesignFirms.length > 0 ? (
                        <RankingChart data={topDesignFirms} color="#059669" />
                    ) : (
                        <p className="text-gray-500 text-sm">データが不足しています。PDF解析を実行してください。</p>
                    )}
                </div>
            </div>
        </div>
    );
}

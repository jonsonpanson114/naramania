import fs from 'fs';
import path from 'path';
import { BiddingItem } from '../../types/bidding';
import RadarChart from '@/components/RadarChart';

// Convert "12,345,000円" to 12345000
function parsePrice(priceStr?: string): number | null {
    if (!priceStr) return null;
    const clean = priceStr.replace(/[^0-9]/g, '');
    const num = parseInt(clean, 10);
    return isNaN(num) ? null : num;
}

export default async function RadarPage() {
    const resultPath = path.join(process.cwd(), 'scraper_result.json');
    let items: BiddingItem[] = [];
    if (fs.existsSync(resultPath)) {
        items = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    }

    // Prepare data for the scatter plot
    // We want to show Distribution of prices across municipalities
    // Only items with valid parsed prices
    const scatterData = items.map(item => {
        const price = parsePrice(item.estimatedPrice);
        if (!price) return null;

        return {
            name: item.title,
            municipality: item.municipality,
            price: price,
            priceLabel: item.estimatedPrice,
            contractor: item.winningContractor || "未定",
            type: item.type
        };
    }).filter(i => i !== null) as any[];

    // Sort by price for the grouped bar chart
    scatterData.sort((a, b) => b.price - a.price);

    // Calculate basic stats
    const totalWithPrice = scatterData.length;
    const avgPrice = totalWithPrice > 0
        ? Math.round(scatterData.reduce((acc, curr) => acc + curr.price, 0) / totalWithPrice)
        : 0;

    const maxItem = scatterData[0];

    return (
        <div className="space-y-12 animate-fade-in-up">
            <div>
                <h1 className="text-3xl font-black text-gray-900 mb-2">価格相場レーダー</h1>
                <p className="text-gray-500">AIが抽出した設計金額から、案件規模の分布と相場感を可視化します。</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                    <span className="text-2xl">📊</span> 案件規模の分布チャート
                </h2>
                {scatterData.length > 0 ? (
                    <RadarChart data={scatterData} />
                ) : (
                    <div className="h-64 flex items-center justify-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                        <p className="text-gray-400 font-medium">価格データが存在しません。PDF解析を実行してください。</p>
                    </div>
                )}
            </div>
        </div>
    );
}

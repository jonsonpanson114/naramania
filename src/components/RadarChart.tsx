'use client';

import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import type { Municipality, BiddingType } from '@/types/bidding';
import { MunicipalityBadge, ProjectTypeBadge } from '@/components/ProjectLabels';
import { getProjectTypeColor } from '@/lib/project_colors';

interface DataPoint {
    name: string;
    municipality: Municipality;
    price: number;
    priceLabel: string;
    contractor: string;
    type: BiddingType;
}

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: DataPoint }> }) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="bg-white p-4 rounded-2xl shadow-xl border border-gray-100 max-w-sm">
                <p className="font-bold text-gray-900 mb-1">{data.name}</p>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    <MunicipalityBadge name={data.municipality} />
                    <ProjectTypeBadge type={data.type} />
                </div>
                <p className="text-xl font-black text-amber-900 mb-1">{new Intl.NumberFormat('ja-JP').format(data.price)}円</p>
                <p className="text-xs text-gray-400">落札者: <span className="text-gray-600 font-medium">{data.contractor}</span></p>
            </div>
        );
    }
    return null;
};

export default function RadarChart({ data }: { data: DataPoint[] }) {
    // Add an index to space them out on the X axis
    const chartData = data.map((d, index) => ({
        ...d,
        xIndex: index + 1
    }));

    return (
        <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2" aria-label="グラフの種別凡例">
                {Array.from(new Set(data.map(item => item.type))).sort().map(type => <ProjectTypeBadge key={type} type={type} />)}
            </div>
            <ResponsiveContainer width="100%" height={320} minWidth={0}>
                <ScatterChart margin={{ top: 16, right: 12, bottom: 12, left: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis type="number" dataKey="xIndex" name="Project" hide />
                    <YAxis
                        type="number"
                        dataKey="price"
                        name="予定価格"
                        tickFormatter={(val) => `¥${(val / 10000).toLocaleString()}万`}
                        tick={{ fill: '#6b7280', fontSize: 12 }}
                        width={100}
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#cbd5e1' }} />
                    <Scatter name="Projects" data={chartData}>
                        {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getProjectTypeColor(entry.type)} />
                        ))}
                    </Scatter>
                </ScatterChart>
            </ResponsiveContainer>
        </div>
    );
}

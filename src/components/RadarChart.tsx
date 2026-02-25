'use client';

import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function RadarChart({ data }: { data: any[] }) {
    // Determine color based on type
    const getColor = (type: string) => {
        if (type === '建築') return '#8b5cf6'; // Violet
        if (type === '設計' || type === 'コンサル') return '#059669'; // Emerald
        if (type === '設備') return '#d97706'; // Amber
        return '#6b7280'; // Gray
    };

    // Add an index to space them out on the X axis
    const chartData = data.map((d, index) => ({
        ...d,
        xIndex: index + 1
    }));

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="bg-white p-4 rounded-2xl shadow-xl border border-gray-100 max-w-sm">
                    <p className="font-bold text-gray-900 mb-1">{data.name}</p>
                    <div className="flex justify-between items-center text-sm text-gray-500 mb-2">
                        <span>{data.municipality}</span>
                        <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{ backgroundColor: getColor(data.type) + '20', color: getColor(data.type) }}>{data.type}</span>
                    </div>
                    <p className="text-xl font-black text-amber-900 mb-1">{new Intl.NumberFormat('ja-JP').format(data.price)}円</p>
                    <p className="text-xs text-gray-400">落札者: <span className="text-gray-600 font-medium">{data.contractor}</span></p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="h-96 w-full animate-fade-in">
            <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis type="number" dataKey="xIndex" name="Project" hide />
                    <YAxis
                        type="number"
                        dataKey="price"
                        name="予定価格"
                        tickFormatter={(val) => `¥${(val / 10000).toLocaleString()}万`}
                        tick={{ fill: '#6b7280', fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#cbd5e1' }} />
                    <Scatter name="Projects" data={chartData}>
                        {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getColor(entry.type)} />
                        ))}
                    </Scatter>
                </ScatterChart>
            </ResponsiveContainer>
        </div>
    );
}

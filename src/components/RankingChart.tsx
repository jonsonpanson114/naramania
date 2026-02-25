'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function RankingChart({ data, color }: { data: { name: string, count: number }[], color: string }) {
    return (
        <div className="h-80 w-full animate-fade-in">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={data}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                    <XAxis type="number" hide />
                    <YAxis
                        dataKey="name"
                        type="category"
                        width={150}
                        tick={{ fill: '#374151', fontSize: 12, fontWeight: 500 }}
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                    />
                    <Tooltip
                        cursor={{ fill: 'rgba(243, 244, 246, 0.5)' }}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                        itemStyle={{ color: '#111827', fontWeight: 600 }}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={color} fillOpacity={0.8 + (0.2 * (data.length - index) / data.length)} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

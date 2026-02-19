'use client';

import { motion } from 'framer-motion';
import { Search, MapPin, Filter } from 'lucide-react';

interface SearchFilterProps {
    keyword: string;
    onKeywordChange: (value: string) => void;
    municipality: string;
    onMunicipalityChange: (value: string) => void;
    status: string;
    onStatusChange: (value: string) => void;
    resultCount: number;
}

const municipalities = [
    'すべて',
    '奈良県', '奈良市', '橿原市', '大和高田市', '大和郡山市', '天理市',
    '桜井市', '御所市', '生駒市', '葛城市', '宇陀市', '五條市',
    '磯城郡川西町', '磯城郡田原本町', '北葛城郡王寺町', '北葛城郡広陵町', '吉野郡大淀町', '吉野町',
];
const statuses = ['すべて', '受付中', '締切間近', '落札', '受付終了'];

export function SearchFilter({
    keyword,
    onKeywordChange,
    municipality,
    onMunicipalityChange,
    status,
    onStatusChange,
    resultCount,
}: SearchFilterProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-12"
        >
            <div className="bg-white/80 backdrop-blur-xl shadow-premium p-8 rounded-lg border border-white/50">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Keyword Search */}
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary/40" />
                        <input
                            type="text"
                            placeholder="キーワード検索（工事名、業者名...）"
                            value={keyword}
                            onChange={(e) => onKeywordChange(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 border border-border/30 rounded-md bg-white/50 text-sm tracking-wider font-serif focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all placeholder:text-secondary/30"
                        />
                    </div>

                    {/* Municipality Filter */}
                    <div className="relative">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary/40" />
                        <select
                            value={municipality}
                            onChange={(e) => onMunicipalityChange(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 border border-border/30 rounded-md bg-white/50 text-sm tracking-wider font-serif focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all appearance-none cursor-pointer"
                        >
                            {municipalities.map((m) => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>

                    {/* Status Filter */}
                    <div className="relative">
                        <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary/40" />
                        <select
                            value={status}
                            onChange={(e) => onStatusChange(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 border border-border/30 rounded-md bg-white/50 text-sm tracking-wider font-serif focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all appearance-none cursor-pointer"
                        >
                            {statuses.map((s) => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Result Count */}
                <div className="mt-6 flex items-center justify-between">
                    <p className="text-[10px] tracking-[0.3em] text-secondary/50 uppercase font-serif">
                        検索結果: <span className="text-accent font-bold text-sm">{resultCount}</span> 件
                    </p>
                    <button
                        onClick={() => {
                            onKeywordChange('');
                            onMunicipalityChange('すべて');
                            onStatusChange('すべて');
                        }}
                        className="text-[10px] tracking-[0.2em] text-secondary/40 hover:text-accent transition-colors uppercase cursor-pointer"
                    >
                        フィルターをリセット
                    </button>
                </div>
            </div>
        </motion.div>
    );
}

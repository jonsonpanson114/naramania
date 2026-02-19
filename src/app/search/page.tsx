'use client';

import { useState, useEffect } from 'react';
import { BiddingItem } from '@/types/bidding';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { BiddingTable } from '@/components/BiddingTable';
import { SearchFilter } from '@/components/SearchFilter';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

export default function SearchPage() {
    const [items, setItems] = useState<BiddingItem[]>([]);
    const [filtered, setFiltered] = useState<BiddingItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [keyword, setKeyword] = useState('');
    const [municipality, setMunicipality] = useState('すべて');
    const [status, setStatus] = useState('すべて');

    useEffect(() => {
        fetch('/api/scrape')
            .then(res => res.json())
            .then(data => {
                setItems(data.items || []);
                setFiltered(data.items || []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    useEffect(() => {
        let result = [...items];

        if (keyword) {
            const kw = keyword.toLowerCase();
            result = result.filter(item =>
                item.title.toLowerCase().includes(kw) ||
                (item.winningContractor?.toLowerCase().includes(kw)) ||
                (item.designFirm?.toLowerCase().includes(kw))
            );
        }

        if (municipality !== 'すべて') {
            result = result.filter(item => item.municipality === municipality);
        }

        if (status !== 'すべて') {
            result = result.filter(item => item.status === status);
        }

        setFiltered(result);
    }, [keyword, municipality, status, items]);

    return (
        <div className="flex min-h-screen bg-background text-primary font-serif">
            <Sidebar />
            <main className="flex-1 ml-64 p-16">
                <Header />

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <h2 className="text-3xl tracking-widest mb-8 font-serif">案件検索</h2>
                    <p className="text-secondary/60 text-sm tracking-wider mb-12">
                        キーワード、自治体、ステータスで案件を絞り込めます。
                    </p>
                </motion.div>

                <SearchFilter
                    keyword={keyword}
                    onKeywordChange={setKeyword}
                    municipality={municipality}
                    onMunicipalityChange={setMunicipality}
                    status={status}
                    onStatusChange={setStatus}
                    resultCount={filtered.length}
                />

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-accent" />
                        <span className="ml-4 text-secondary tracking-wider">データ読込中...</span>
                    </div>
                ) : (
                    <BiddingTable items={filtered} />
                )}
            </main>
        </div>
    );
}

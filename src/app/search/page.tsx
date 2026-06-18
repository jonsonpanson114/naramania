'use client';

import { useState, useEffect } from 'react';
import { BiddingItem } from '@/types/bidding';
import { AppShell } from '@/components/AppShell';
import { Header } from '@/components/Header';
import { BiddingTable } from '@/components/BiddingTable';
import { SearchFilter } from '@/components/SearchFilter';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { PRACTICAL_FILTERS, PracticalFilter, countPracticalFilter, matchesPracticalFilter } from '@/lib/practical_filters';

export default function SearchPage() {
    const [items, setItems] = useState<BiddingItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [keyword, setKeyword] = useState('');
    const [municipality, setMunicipality] = useState('すべて');
    const [status, setStatus] = useState('すべて');
    const [quickFilter, setQuickFilter] = useState<PracticalFilter>('all');
    const municipalities = Array.from(new Set(items.map(item => item.municipality))).sort();

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const quick = params.get('quick') as PracticalFilter | null;
        const statusParam = params.get('status');
        const municipalityParam = params.get('municipality');
        const keywordParam = params.get('q');
        if (quick && PRACTICAL_FILTERS.some(filter => filter.id === quick)) setQuickFilter(quick);
        if (statusParam) setStatus(statusParam);
        if (municipalityParam) setMunicipality(municipalityParam);
        if (keywordParam) setKeyword(keywordParam);

        fetch('/api/scrape')
            .then(res => res.json())
            .then(data => {
                setItems(data.items || []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const filtered = (() => {
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

        result = result.filter(item => matchesPracticalFilter(item, quickFilter));

        return result;
    })();

    const quickCounts = Object.fromEntries(
        PRACTICAL_FILTERS.map(filter => [filter.id, countPracticalFilter(items, filter.id)]),
    ) as Record<PracticalFilter, number>;

    return (
        <AppShell>
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
                    municipalities={municipalities}
                    municipality={municipality}
                    onMunicipalityChange={setMunicipality}
                    status={status}
                    onStatusChange={setStatus}
                    quickFilter={quickFilter}
                    onQuickFilterChange={setQuickFilter}
                    quickCounts={quickCounts}
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
        </AppShell>
    );
}

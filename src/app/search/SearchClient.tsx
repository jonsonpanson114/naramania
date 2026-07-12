'use client';

import { useState, useEffect } from 'react';
import { BiddingItem } from '@/types/bidding';
import { Header } from '@/components/Header';
import { BiddingTable } from '@/components/BiddingTable';
import { SearchFilter } from '@/components/SearchFilter';
import { motion } from 'framer-motion';
import { PRACTICAL_FILTERS, PracticalFilter, countPracticalFilter, matchesPracticalFilter } from '@/lib/practical_filters';

type SearchInitialState = {
    keyword: string;
    municipality: string;
    status: string;
    quickFilter: PracticalFilter;
};

function readInitialSearchState(): SearchInitialState {
    if (typeof window === 'undefined') {
        return {
            keyword: '',
            municipality: 'すべて',
            status: 'すべて',
            quickFilter: 'all',
        };
    }

    const params = new URLSearchParams(window.location.search);
    const quick = params.get('quick') as PracticalFilter | null;

    return {
        keyword: params.get('q') || '',
        municipality: params.get('municipality') || 'すべて',
        status: params.get('status') || 'すべて',
        quickFilter: quick && PRACTICAL_FILTERS.some(filter => filter.id === quick) ? quick : 'all',
    };
}

export function SearchClient({ items }: { items: BiddingItem[] }) {
    const [keyword, setKeyword] = useState('');
    const [municipality, setMunicipality] = useState('すべて');
    const [status, setStatus] = useState('すべて');
    const [quickFilter, setQuickFilter] = useState<PracticalFilter>('all');
    const municipalities = Array.from(new Set(items.map(item => item.municipality))).sort();

    useEffect(() => {
        const timer = window.setTimeout(() => {
            const initialSearchState = readInitialSearchState();
            setKeyword(initialSearchState.keyword);
            setMunicipality(initialSearchState.municipality);
            setStatus(initialSearchState.status);
            setQuickFilter(initialSearchState.quickFilter);
        }, 0);

        return () => window.clearTimeout(timer);
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
        <>
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

            <BiddingTable items={filtered} />
        </>
    );
}

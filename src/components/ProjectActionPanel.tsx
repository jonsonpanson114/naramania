'use client';

import { useState } from 'react';
import { BiddingItem } from '@/types/bidding';
import { Bookmark, Briefcase, Trash2, Award, AlertTriangle, Layers, Send, TrendingUp, type LucideIcon } from 'lucide-react';

type SalesStatus = 'pending' | 'active' | 'negotiating' | 'won' | 'lost';
type SavedBiddingItem = BiddingItem & { salesStatus?: SalesStatus };

const statusConfig: Record<SalesStatus, { label: string; color: string; bg: string; border: string; icon: LucideIcon }> = {
    pending: { label: 'アプローチ前', color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200', icon: Layers },
    active: { label: '元請け営業中', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', icon: Send },
    negotiating: { label: '見積提示中', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', icon: TrendingUp },
    won: { label: '受注確定！', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', icon: Award },
    lost: { label: '失注', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', icon: AlertTriangle }
};

interface ProjectActionPanelProps {
    item: BiddingItem;
}

function readSavedItem(itemId: string): SavedBiddingItem | undefined {
    if (typeof window === 'undefined') return undefined;
    const stored = localStorage.getItem('naramania_saved');
    if (!stored) return undefined;
    try {
        const savedItems = JSON.parse(stored) as SavedBiddingItem[];
        return savedItems.find(i => i.id === itemId);
    } catch (error) {
        console.error(error);
        return undefined;
    }
}

export function ProjectActionPanel({ item }: ProjectActionPanelProps) {
    const initialSavedItem = readSavedItem(item.id);
    const [isSaved, setIsSaved] = useState(Boolean(initialSavedItem));
    const [salesStatus, setSalesStatus] = useState<SalesStatus>(initialSavedItem?.salesStatus || 'pending');

    const handleSave = () => {
        const stored = localStorage.getItem('naramania_saved');
        let savedItems: SavedBiddingItem[] = [];
        if (stored) {
            try {
                savedItems = JSON.parse(stored);
            } catch (e) {
                console.error(e);
            }
        }

        const isAlreadySaved = savedItems.some(i => i.id === item.id);
        if (!isAlreadySaved) {
            const newItem = {
                ...item,
                salesStatus: 'pending'
            };
            const updated = [...savedItems, newItem];
            localStorage.setItem('naramania_saved', JSON.stringify(updated));
            setIsSaved(true);
            setSalesStatus('pending');
        }
    };

    const handleRemove = () => {
        const stored = localStorage.getItem('naramania_saved');
        if (stored) {
            try {
                const savedItems = JSON.parse(stored) as SavedBiddingItem[];
                const updated = savedItems.filter(i => i.id !== item.id);
                localStorage.setItem('naramania_saved', JSON.stringify(updated));
                setIsSaved(false);
            } catch (e) {
                console.error(e);
            }
        }
    };

    const handleStatusChange = (newStatus: SalesStatus) => {
        const stored = localStorage.getItem('naramania_saved');
        if (stored) {
            try {
                const savedItems = JSON.parse(stored) as SavedBiddingItem[];
                const updated = savedItems.map(i =>
                    i.id === item.id ? { ...i, salesStatus: newStatus } : i
                );
                localStorage.setItem('naramania_saved', JSON.stringify(updated));
                setSalesStatus(newStatus);
            } catch (e) {
                console.error(e);
            }
        }
    };

    const config = statusConfig[salesStatus];
    const StatusIcon = config.icon;

    return (
        <div className="bg-white/80 backdrop-blur-xl shadow-premium p-6 rounded-2xl border border-white/50 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                    <Briefcase className="w-4 h-4 text-accent" />
                    <span className="text-[10px] tracking-[0.25em] text-accent font-bold uppercase">下請け営業管理</span>
                </div>
                <h4 className="text-sm font-serif font-semibold tracking-wider text-primary">
                    {isSaved
                        ? `この案件をお気に入り保存中（ステータス: ${config.label}）`
                        : 'この案件をお気に入りに保存して、元請け営業管理を始めましょう！'}
                </h4>
                <p className="text-xs text-secondary/55 tracking-wider mt-1">
                    お気に入りに登録すると、営業のアプローチ状況（交渉中、受注確定など）をダッシュボードで進捗管理できます。
                </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
                {isSaved ? (
                    <>
                        <div className="flex items-center gap-2 bg-slate-50 border border-border/20 px-4 py-2.5 rounded-lg shadow-sm">
                            <StatusIcon size={14} className={config.color} />
                            <span className="text-xs font-semibold tracking-wider text-secondary/50 uppercase font-mono">営業進捗:</span>
                            <select
                                value={salesStatus}
                                onChange={(e) => handleStatusChange(e.target.value as SalesStatus)}
                                className={`text-xs font-bold tracking-wider bg-transparent border-none focus:outline-none cursor-pointer ${config.color}`}
                            >
                                {(Object.keys(statusConfig) as SalesStatus[]).map((status) => (
                                    <option key={status} value={status} className="text-secondary font-sans font-normal">
                                        {statusConfig[status].label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <button
                            onClick={handleRemove}
                            className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 px-4 py-2.5 rounded-lg text-xs font-bold tracking-wider flex items-center gap-2 transition-all cursor-pointer"
                        >
                            <Trash2 size={14} />
                            解除
                        </button>
                    </>
                ) : (
                    <button
                        onClick={handleSave}
                        className="bg-accent hover:bg-accent/90 text-white px-6 py-2.5 rounded-lg text-xs font-bold tracking-widest flex items-center gap-2 transition-all cursor-pointer shadow-md"
                    >
                        <Bookmark className="w-4 h-4" />
                        営業管理に保存
                    </button>
                )}
            </div>
        </div>
    );
}

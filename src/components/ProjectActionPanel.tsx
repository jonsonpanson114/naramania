'use client';

import { useEffect, useState } from 'react';
import { BiddingItem } from '@/types/bidding';
import { Bookmark, Trash2, Award, AlertTriangle, Layers, Send, TrendingUp, type LucideIcon } from 'lucide-react';
import { WatchButton } from '@/components/WatchButton';

type SalesStatus = 'pending' | 'active' | 'negotiating' | 'won' | 'lost';
type SavedBiddingItem = BiddingItem & { salesStatus?: SalesStatus };

const statusConfig: Record<SalesStatus, { label: string; icon: LucideIcon }> = {
    pending: { label: 'アプローチ前', icon: Layers },
    active: { label: '元請け営業中', icon: Send },
    negotiating: { label: '見積提示中', icon: TrendingUp },
    won: { label: '受注確定！', icon: Award },
    lost: { label: '失注', icon: AlertTriangle }
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
    const [isSaved, setIsSaved] = useState(false);
    const [salesStatus, setSalesStatus] = useState<SalesStatus>('pending');

    useEffect(() => {
        const timer = window.setTimeout(() => {
            const savedItem = readSavedItem(item.id);
            setIsSaved(Boolean(savedItem));
            setSalesStatus(savedItem?.salesStatus || 'pending');
        }, 0);
        return () => window.clearTimeout(timer);
    }, [item.id]);

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

    const StatusIcon = statusConfig[salesStatus].icon;

    return (
        <>
            <div className="min-w-32 [&>button]:min-h-9 [&>button]:rounded-[5px] [&>button]:text-sm [&>button]:tracking-normal">
                <WatchButton itemId={item.id} />
            </div>
            {isSaved ? (
                <>
                    <label className="inline-flex min-h-9 items-center gap-1.5 rounded-[5px] border border-border bg-paper-tint px-2.5 text-sm">
                        <StatusIcon size={15} className="text-accent" aria-hidden="true" />
                        <span className="font-semibold">営業進捗</span>
                        <select
                            value={salesStatus}
                            onChange={(e) => handleStatusChange(e.target.value as SalesStatus)}
                            className="min-w-0 cursor-pointer rounded bg-transparent py-1 pr-1 font-bold text-primary"
                        >
                            {(Object.keys(statusConfig) as SalesStatus[]).map((status) => (
                                <option key={status} value={status}>
                                    {statusConfig[status].label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <button type="button" onClick={handleRemove} className="paper-button">
                        <Trash2 size={15} aria-hidden="true" />
                        保存を解除
                    </button>
                </>
            ) : (
                <button type="button" onClick={handleSave} className="paper-button">
                    <Bookmark size={16} aria-hidden="true" />
                    営業管理に保存
                </button>
            )}
        </>
    );
}

import fs from 'fs';
import type { BiddingItem } from '@/types/bidding';
import { resolveWatchedFirms, type WatchedFirm, type WatchedFirmsConfig } from './watched_firms';

/**
 * 奈良の設計事務所の名簿を、手元のデータから作る。ニュースの収集と大阪の入札結果の収集で同じ名簿を使う。
 * 入札の収集データ(今の一覧・全件・自治体ごとの過去データ)と config/watched_firms.json から作り直す。
 */

function readJson<T>(path: string, fallback: T): T {
    try {
        return JSON.parse(fs.readFileSync(path, 'utf-8')) as T;
    } catch {
        return fallback;
    }
}

export function loadWatchedFirms(): WatchedFirm[] {
    const items = readJson<BiddingItem[]>('scraper_result.json', []);
    const market = readJson<BiddingItem[] | { items?: BiddingItem[] }>('market_items.json', []);
    const marketItems = Array.isArray(market) ? market : market.items ?? [];
    // 自治体ごとの過去データには、今の一覧から落ちた案件の落札者や入札者も残っている
    const snapshots = Object.values(readJson<Record<string, BiddingItem[]>>('municipality_snapshots.json', {})).flat();
    const config = readJson<WatchedFirmsConfig>('config/watched_firms.json', {});
    return resolveWatchedFirms([...items, ...marketItems, ...snapshots], config);
}

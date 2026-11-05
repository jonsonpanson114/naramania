import type { BiddingItem, BiddingStatus } from '@/types/bidding';

export type DisplayStatus = BiddingStatus | '中止';

/**
 * 画面に出す状態。中止・取止めは結果の確定した案件として「不調」と同じように
 * 扱うが、入札者がいなかった不調とは意味が違うので表示だけ分ける。
 */
export function displayStatus(item: Pick<BiddingItem, 'status' | 'cancelled'>): DisplayStatus {
    return item.status === '不調' && item.cancelled ? '中止' : item.status;
}

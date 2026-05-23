import type { BiddingItem } from '@/types/bidding';

function resolveTitle(value: string | Pick<BiddingItem, 'title'>): string {
    return typeof value === 'string' ? value : value.title;
}

export function isProposalLike(value: string | Pick<BiddingItem, 'title'>): boolean {
    const title = resolveTitle(value);
    return /プロポーザル|プレゼンテーション|ヒアリング/.test(title);
}

export function getBiddingLabel(value: string | Pick<BiddingItem, 'title'>): string {
    return isProposalLike(value) ? '審査日' : '開札日';
}

export function getShortBiddingLabel(value: string | Pick<BiddingItem, 'title'>): string {
    return isProposalLike(value) ? '審査' : '開札';
}

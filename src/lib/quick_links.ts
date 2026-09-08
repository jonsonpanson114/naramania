import type { BiddingItem } from '@/types/bidding';
import { matchesPracticalFilter } from './practical_filters';
import type { ViewTab } from './practical_filters';

/**
 * 画面のあちこちから検索画面へ渡す「用途別の入口」。
 *
 * 以前は検索画面が quick をタブにしか変換しておらず、
 * ・schoolToilet は変換表に無く、受付中一覧になっていた
 * ・missingWinner は追跡待ちタブに化けていた
 * ・新着と直近開札はどちらも受付中一覧へ飛んでいた
 * 押したリンク名と出てくる一覧が違うのは、間違った案件を見ることに直結する。
 * 入口の定義をここに1つだけ置き、リンク側と検索画面の両方がこれを使う。
 */

export type QuickLinkKey =
    | 'all'
    | 'active'
    | 'resultFollowUp'
    | 'missingWinner'
    | 'opened'
    | 'schoolToilet'
    | 'newArrivals'
    | 'upcomingBidding';

export type QuickLink = {
    key: QuickLinkKey;
    label: string;
    description: string;
    /** 一覧をどのタブで開くか。絞り込み自体は matches が担当する */
    tab: ViewTab;
    matches: (item: BiddingItem, referenceDate: Date) => boolean;
};

/** 公告日・開札日を日付だけに揃える */
function toDateOnly(value?: string): string {
    return (value || '').slice(0, 10);
}

function shiftDateKey(referenceDate: Date, days: number): string {
    const shifted = new Date(referenceDate.getTime() + days * 24 * 60 * 60 * 1000);
    return shifted.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
}

export const QUICK_LINKS: Record<QuickLinkKey, QuickLink> = {
    all: {
        key: 'all',
        label: 'すべて',
        description: '',
        tab: 'all',
        matches: () => true,
    },
    active: {
        key: 'active',
        label: '受付中',
        description: 'いま応札できる案件です。',
        tab: 'active',
        matches: (item) => matchesPracticalFilter(item, 'active'),
    },
    resultFollowUp: {
        key: 'resultFollowUp',
        label: '追跡待ち',
        description: '開札済みで結果がまだ確定していない案件です。',
        tab: 'followUp',
        matches: (item) => matchesPracticalFilter(item, 'resultFollowUp'),
    },
    missingWinner: {
        key: 'missingWinner',
        label: '落札者未登録',
        description: '落札とされているのに落札者が入っていない案件です。',
        tab: 'all',
        matches: (item) => matchesPracticalFilter(item, 'missingWinner'),
    },
    opened: {
        key: 'opened',
        label: '開札済み',
        description: '開札が終わった案件です。',
        tab: 'results',
        matches: (item) => matchesPracticalFilter(item, 'opened'),
    },
    schoolToilet: {
        key: 'schoolToilet',
        label: '学校トイレ',
        description: '学校・園のトイレ改修に関する案件です。',
        tab: 'all',
        matches: (item) => matchesPracticalFilter(item, 'schoolToilet'),
    },
    newArrivals: {
        key: 'newArrivals',
        label: '新着公告',
        description: '直近7日間に公告された案件です。',
        tab: 'all',
        matches: (item, referenceDate) => {
            const since = shiftDateKey(referenceDate, -7);
            return Boolean(item.announcementDate) && toDateOnly(item.announcementDate) >= since;
        },
    },
    upcomingBidding: {
        key: 'upcomingBidding',
        label: '直近開札',
        description: '7日以内に開札を迎える案件です。',
        tab: 'all',
        matches: (item, referenceDate) => {
            if (!item.biddingDate) return false;
            if (item.status === '落札' || item.status === '受付終了') return false;
            const today = shiftDateKey(referenceDate, 0);
            const limit = shiftDateKey(referenceDate, 7);
            const date = toDateOnly(item.biddingDate);
            return date >= today && date <= limit;
        },
    },
};

export function resolveQuickLink(value?: string): QuickLink {
    if (value && value in QUICK_LINKS) return QUICK_LINKS[value as QuickLinkKey];
    return QUICK_LINKS.all;
}

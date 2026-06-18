import type { BiddingItem } from '@/types/bidding';

export type PracticalFilter = 'all' | 'missingWinner' | 'opened' | 'schoolToilet' | 'active';

export type PracticalFilterDefinition = {
  id: PracticalFilter;
  label: string;
  shortLabel: string;
  description: string;
};

export const PRACTICAL_FILTERS: PracticalFilterDefinition[] = [
  {
    id: 'all',
    label: 'すべて',
    shortLabel: 'すべて',
    description: '対象案件をすべて表示',
  },
  {
    id: 'missingWinner',
    label: '落札者未取得だけ',
    shortLabel: '落札者未取得',
    description: '落札済みなのに落札者が空の案件を確認',
  },
  {
    id: 'opened',
    label: '開札済みだけ',
    shortLabel: '開札済み',
    description: '落札・不調・受付終了または開札日を過ぎた案件',
  },
  {
    id: 'schoolToilet',
    label: '学校・トイレ改修だけ',
    shortLabel: '学校トイレ',
    description: '学校系のトイレ改修・便所改修案件',
  },
  {
    id: 'active',
    label: '受付中だけ',
    shortLabel: '受付中',
    description: '今すぐ追える受付中案件',
  },
];

function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function isOpenedItem(item: BiddingItem, referenceDate = todayIso()): boolean {
  if (item.status === '落札' || item.status === '不調' || item.status === '受付終了') return true;
  return Boolean(item.biddingDate && item.biddingDate < referenceDate);
}

export function isSchoolToiletItem(item: BiddingItem): boolean {
  const text = [item.title, item.description || '', ...(item.tags || [])].join(' ').normalize('NFKC');
  const hasSchool = /学校|小学校|中学校|校舎|幼稚園|こども園|保育園|保育所/.test(text);
  const hasToilet = /トイレ|便所|便器|衛生/.test(text);
  const hasWork = /改修|修繕|工事|設計|監理/.test(text);
  return hasSchool && hasToilet && hasWork;
}

export function matchesPracticalFilter(item: BiddingItem, filter: PracticalFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'missingWinner') return item.status === '落札' && !item.winningContractor;
  if (filter === 'opened') return isOpenedItem(item);
  if (filter === 'schoolToilet') return isSchoolToiletItem(item);
  if (filter === 'active') return item.status === '受付中';
  return true;
}

export function countPracticalFilter(items: BiddingItem[], filter: PracticalFilter): number {
  return items.filter((item) => matchesPracticalFilter(item, filter)).length;
}

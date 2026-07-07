import type { BiddingItem } from '@/types/bidding';

export type PracticalFilter = 'all' | 'missingWinner' | 'resultFollowUp' | 'opened' | 'schoolToilet' | 'active';

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
    id: 'resultFollowUp',
    label: '結果追跡待ちだけ',
    shortLabel: '結果追跡待ち',
    description: '受付終了のまま落札・不調まで追えていない案件を確認',
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

/** 今年度の開始日（4月1日）をISO形式で返す */
export function fiscalYearStartIso(referenceDate = todayIso()): string {
  const [year, month] = referenceDate.split('-').map(Number);
  const fiscalYearStart = month >= 4 ? year : year - 1;
  return `${fiscalYearStart}-04-01`;
}

/** 今年度（4月1日以降に開札または公告）の案件か */
export function isCurrentFiscalYearItem(item: BiddingItem, referenceDate = todayIso()): boolean {
  const baseDate = item.biddingDate || item.announcementDate;
  return Boolean(baseDate && baseDate >= fiscalYearStartIso(referenceDate));
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
  // 結果追跡は今年度案件のみ対象（過年度の未解決分は追わない運用方針）
  // 発注見通し由来の公告前案件も追跡しない
  if (filter === 'resultFollowUp') {
    return !item.isForecast
      && isCurrentFiscalYearItem(item)
      && (item.status === '受付終了' || (item.status === '落札' && !item.winningContractor));
  }
  if (filter === 'opened') return isOpenedItem(item);
  if (filter === 'schoolToilet') return isSchoolToiletItem(item);
  if (filter === 'active') return item.status === '受付中' && !isOpenedItem(item);
  return true;
}

export function countPracticalFilter(items: BiddingItem[], filter: PracticalFilter): number {
  return items.filter((item) => matchesPracticalFilter(item, filter)).length;
}

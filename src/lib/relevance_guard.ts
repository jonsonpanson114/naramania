import type { BiddingItem } from '@/types/bidding';

export type RelevanceStatus = 'target' | 'watch' | 'noise';

export type RelevanceAssessment = {
  status: RelevanceStatus;
  label: string;
  reasons: string[];
  matchedNoise: string[];
  matchedTarget: string[];
};

export type RelevanceSummary = {
  targetCount: number;
  watchCount: number;
  noiseCount: number;
  noiseItems: Array<{
    item: BiddingItem;
    assessment: RelevanceAssessment;
  }>;
};

const NOISE_KEYWORDS = [
  '土木',
  '道路',
  '舗装',
  '橋梁',
  '河川',
  '砂防',
  '法面',
  '護岸',
  '水路',
  '側溝',
  '下水',
  '上水',
  '水道',
  '配水',
  '管路',
  '農道',
  '林道',
  '擁壁',
  '除草',
  '除雪',
  '区画線',
  'ガードレール',
  '交通安全',
  'エレベーター',
  '昇降機',
  '設備',
  '空調',
  'エアコン',
  'LED',
  '照明',
  '受変電',
  '受電',
  '電気設備',
  '機械設備',
  '消防用設備',
  '自動火災報知',
  '給排水',
  '給水設備',
  '発電設備',
  'ボイラー',
  'ポンプ',
];

const TARGET_CONTEXT_KEYWORDS = [
  '建築',
  '建物',
  '学校',
  '小学校',
  '中学校',
  '校舎',
  '幼稚園',
  '保育園',
  '保育所',
  'こども園',
  '庁舎',
  '住宅',
  '団地',
  '公民館',
  '会館',
  '交流館',
  '体育館',
  '図書館',
  '消防署',
  'センター',
  'トイレ',
  '便所',
  '外壁',
  '屋上',
  '屋根',
  '内装',
  '防水',
  '耐震',
  '仮眠室',
  '書庫',
];

const TARGET_WORK_KEYWORDS = [
  '工事',
  '修繕',
  '改修',
  '新築',
  '増築',
  '解体',
  '除却',
  '設計',
  '監理',
  '診断',
  '調査',
  '基本計画',
  '発注支援',
];

const NOISE_LABELS: Record<string, string> = {
  土木: '土木系',
  道路: '道路系',
  舗装: '舗装系',
  橋梁: '橋梁系',
  河川: '河川系',
  水道: '水道系',
  下水: '下水系',
  設備: '設備系',
  空調: '設備系',
  エアコン: '設備系',
  LED: '設備系',
  照明: '設備系',
  エレベーター: 'EV系',
  昇降機: 'EV系',
};

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

function uniqueMatches(text: string, keywords: string[]): string[] {
  const normalizedText = normalize(text);
  return Array.from(new Set(keywords.filter((keyword) => normalizedText.includes(normalize(keyword)))));
}

function describeNoise(matches: string[]): string[] {
  const labels = matches.map((match) => NOISE_LABELS[match] || `${match}系`);
  return Array.from(new Set(labels));
}

export function assessBiddingScope(item: BiddingItem): RelevanceAssessment {
  const text = [item.title, item.description || '', item.type || '', ...(item.tags || [])].join(' ');
  const matchedNoise = uniqueMatches(text, NOISE_KEYWORDS);
  const matchedContext = uniqueMatches(text, TARGET_CONTEXT_KEYWORDS);
  const matchedWork = uniqueMatches(text, TARGET_WORK_KEYWORDS);
  const matchedTarget = Array.from(new Set([...matchedContext, ...matchedWork]));

  if (matchedNoise.length > 0) {
    const noiseReasons = describeNoise(matchedNoise);
    return {
      status: 'noise',
      label: '対象外候補',
      reasons: noiseReasons.length > 0 ? noiseReasons : ['除外キーワード'],
      matchedNoise,
      matchedTarget,
    };
  }

  if (matchedContext.length > 0 && matchedWork.length > 0) {
    return {
      status: 'target',
      label: '対象',
      reasons: ['建築本体または設計監理'],
      matchedNoise,
      matchedTarget,
    };
  }

  return {
    status: 'watch',
    label: '要確認',
    reasons: matchedWork.length > 0 ? ['建築文脈が薄い案件'] : ['対象判定に必要な語が不足'],
    matchedNoise,
    matchedTarget,
  };
}

export function summarizeBiddingScope(items: BiddingItem[]): RelevanceSummary {
  return items.reduce<RelevanceSummary>((summary, item) => {
    const assessment = assessBiddingScope(item);
    if (assessment.status === 'target') summary.targetCount += 1;
    if (assessment.status === 'watch') summary.watchCount += 1;
    if (assessment.status === 'noise') {
      summary.noiseCount += 1;
      summary.noiseItems.push({ item, assessment });
    }
    return summary;
  }, {
    targetCount: 0,
    watchCount: 0,
    noiseCount: 0,
    noiseItems: [],
  });
}

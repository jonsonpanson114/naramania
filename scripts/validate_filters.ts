import type { BiddingItem } from '../src/types/bidding';
import { shouldKeepBiddingItem, shouldKeepItem } from '../src/scrapers/common/filter';

type FilterCase = {
  title: string;
  description?: string;
  expected: boolean;
  reason: string;
};

const KEEP_CASES: FilterCase[] = [
  {
    title: '五條市立小学校トイレ改修工事',
    expected: true,
    reason: '学校トイレ改修は建築本体案件として必ず残す',
  },
  {
    title: '葛城市立中学校トイレ改修工事設計業務',
    expected: true,
    reason: '学校トイレ改修の設計業務は対象',
  },
  {
    title: '緑ヶ丘中学校外３校屋上防水改修設計業務',
    expected: true,
    reason: '学校の屋上防水改修設計は対象',
  },
  {
    title: '市営住宅空家修繕工事',
    expected: true,
    reason: '住宅修繕工事は対象',
  },
  {
    title: '公民館外壁改修工事',
    expected: true,
    reason: '公共建物の外壁改修は対象',
  },
];

const REJECT_CASES: FilterCase[] = [
  {
    title: '香久山小学校 自動火災報知設備修繕業務',
    expected: false,
    reason: '学校名があっても設備単体は対象外',
  },
  {
    title: '庁舎エレベーター改修工事',
    expected: false,
    reason: 'エレベーター単体は対象外',
  },
  {
    title: '体育館空調設備更新工事',
    expected: false,
    reason: '空調・設備更新は対象外',
  },
  {
    title: '道路舗装修繕工事',
    expected: false,
    reason: '道路・舗装は土木系で対象外',
  },
  {
    title: '小学校LED照明更新工事',
    expected: false,
    reason: '学校名があってもLED照明は対象外',
  },
  {
    title: '給水設備改修工事',
    expected: false,
    reason: '給水設備単体は対象外',
  },
  {
    title: 'マテリアルリサイクル推進施設発注支援業務',
    expected: false,
    reason: '清掃・リサイクル施設系の発注支援は対象外',
  },
];

function makeItem(title: string, description?: string): BiddingItem {
  return {
    id: `filter-test-${title}`,
    municipality: '五條市',
    title,
    type: title.includes('設計') ? 'コンサル' : '建築',
    announcementDate: '2026-06-01',
    link: 'https://example.test/',
    status: '受付中',
    description,
  };
}

function runCase(testCase: FilterCase): string | null {
  const directResult = shouldKeepItem(testCase.title, testCase.description);
  const itemResult = shouldKeepBiddingItem(makeItem(testCase.title, testCase.description), new Date('2026-06-18T00:00:00+09:00'));
  if (directResult !== testCase.expected || itemResult !== testCase.expected) {
    return `${testCase.expected ? 'KEEP' : 'REJECT'} expected: ${testCase.title} / direct=${directResult} item=${itemResult} / ${testCase.reason}`;
  }
  return null;
}

function main() {
  const failures = [...KEEP_CASES, ...REJECT_CASES]
    .map(runCase)
    .filter((message): message is string => Boolean(message));

  if (failures.length > 0) {
    console.error('[filters] validation failed');
    failures.forEach((failure) => console.error(`[filters] ${failure}`));
    process.exit(1);
  }

  console.log(`[filters] validation passed (${KEEP_CASES.length} keep / ${REJECT_CASES.length} reject)`);
}

main();

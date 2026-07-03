import type { BiddingItem } from '../src/types/bidding';
import { shouldKeepBiddingItem, shouldKeepItem } from '../src/scrapers/common/filter';
import { isOpenedItem, isSchoolToiletItem, matchesPracticalFilter } from '../src/lib/practical_filters';

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
];

const REJECT_CASES: FilterCase[] = [
  {
    title: '公民館外壁改修工事',
    expected: false,
    reason: '外壁改修は対象外',
  },
  {
    title: '広陵西小学校ベランダ手摺改修工事',
    description: '広陵西小学校ベランダ手摺改修工事 外壁改修工事一式',
    expected: false,
    reason: 'タイトルだけで建築寄りでも説明に外壁があれば対象外',
  },
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
    title: 'アザレアホール屋上排煙ファン更新工事',
    expected: false,
    reason: 'ホール名や屋上があっても排煙ファン単体更新は対象外',
  },
  {
    title: '消防防災施設整備事業 耐震性貯水槽設置工事',
    expected: false,
    reason: '貯水槽設置は建築本体ではなく設備・インフラ寄り',
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
    title: '葛城市内学校施設電話主装置等更新工事',
    expected: false,
    reason: '学校施設名があっても電話設備単体は対象外',
  },
  {
    title: '第08-302号 公園施設長寿命化対策支援事業に伴う屋敷山公園遊具更新工事',
    expected: false,
    reason: '公園遊具更新は建築本体ではない',
  },
  {
    title: '第07-303号 公園施設長寿命化対策支援事業に伴う屋敷山公園噴水広場更新工事',
    expected: false,
    reason: '公園噴水広場更新は建築本体ではない',
  },
  {
    title: '第8-105号屋根付きベンチ設置工事',
    expected: false,
    reason: '屋根という文字があってもベンチ設置は建築本体ではない',
  },
  {
    title: '第7-102号 ストックマネジメント修繕改築計画に基づくマンホール蓋更新工事',
    expected: false,
    reason: 'マンホール蓋更新は土木・下水系で対象外',
  },
  {
    title: '第7-603号 白光田池貯留施設設置工事',
    expected: false,
    reason: '貯留施設設置は建築本体ではない',
  },
  {
    title: '壱分小学校線支線３号歩行者空間整備工事',
    expected: false,
    reason: '小学校という文字があっても歩行者空間整備は土木・道路系',
  },
  {
    title: '醍醐地下歩道屋根修繕工事7-1',
    expected: false,
    reason: '地下歩道は建物本体ではなく土木・通路系',
  },
  {
    title: '井出山体育施設テニスコート（ハードコート）修繕工事',
    expected: false,
    reason: 'テニスコート修繕は建築本体ではない',
  },
  {
    title: '真菅小学校プールサイド改修工事',
    expected: false,
    reason: '学校名があってもプールサイド単体改修は対象外',
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
  const gojoToilet = makeItem('五條市立小学校トイレ改修工事');
  const awardedWithWinner = {
    ...gojoToilet,
    status: '落札' as const,
    biddingDate: '2026-05-29',
    winningContractor: '有希建設（株）',
  };
  const awardedWithoutWinner = {
    ...gojoToilet,
    id: 'filter-test-missing-winner',
    status: '落札' as const,
    biddingDate: '2026-05-29',
    winningContractor: undefined,
  };

  if (!isSchoolToiletItem(gojoToilet) || !matchesPracticalFilter(gojoToilet, 'schoolToilet')) {
    failures.push('Practical filter expected schoolToilet: 五條市立小学校トイレ改修工事');
  }
  if (!isOpenedItem(awardedWithWinner) || !matchesPracticalFilter(awardedWithWinner, 'opened')) {
    failures.push('Practical filter expected opened: 落札済み案件');
  }
  if (!matchesPracticalFilter(awardedWithoutWinner, 'missingWinner')) {
    failures.push('Practical filter expected missingWinner: 落札者未取得案件');
  }
  if (matchesPracticalFilter(awardedWithWinner, 'missingWinner')) {
    failures.push('Practical filter must not mark winner-filled awarded item as missingWinner');
  }
  if (!matchesPracticalFilter(gojoToilet, 'active')) {
    failures.push('Practical filter expected active: future or undated 受付中案件');
  }
  if (matchesPracticalFilter({ ...gojoToilet, biddingDate: '2026-05-29' }, 'active')) {
    failures.push('Practical filter must not mark opened 受付中 item as active');
  }

  if (failures.length > 0) {
    console.error('[filters] validation failed');
    failures.forEach((failure) => console.error(`[filters] ${failure}`));
    process.exit(1);
  }

  console.log(`[filters] validation passed (${KEEP_CASES.length} keep / ${REJECT_CASES.length} reject / practical filters)`);
}

main();

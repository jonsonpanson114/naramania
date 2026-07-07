import { shouldKeepBiddingItem } from '../../src/scrapers/common/filter';
import type { BiddingItem } from '../../src/types/bidding';

const base: BiddingItem = {
  id: 'test-1',
  municipality: '葛城市',
  title: '忍海小学校区学童保育所施設整備工事',
  type: '建築',
  announcementDate: '2026-03-10',
  link: 'https://example.com',
  status: '落札',
};

// augment_intelligence.ts は description 付与時に必ず isIntelligenceExtracted/extractionSource を立てる
console.log('タイトルのみ:', shouldKeepBiddingItem(base));
console.log('AI要約(空調設備を含む)+フラグ:', shouldKeepBiddingItem({
  ...base,
  description: '校舎の増築および空調設備の更新を含む学童保育所の整備工事。',
  isIntelligenceExtracted: true,
  extractionSource: 'gemini',
}));
console.log('AIタグ(調査を含む)+フラグ:', shouldKeepBiddingItem({
  ...base,
  description: '概要',
  tags: ['建築', '調査'],
  isIntelligenceExtracted: true,
  extractionSource: 'gemini',
}));
// 除外対象タイトルはAI補強に関係なく落ちること
console.log('除外タイトル(空調設備更新工事):', shouldKeepBiddingItem({
  ...base,
  title: '大和高田市立高田こども園空調設備更新工事',
}));

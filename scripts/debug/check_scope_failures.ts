import fs from 'fs';
import { shouldKeepBiddingItem, shouldKeepItem } from '../../src/scrapers/common/filter';
import dataFilters from '../../config/data_filters.json';
import type { BiddingItem } from '../../src/types/bidding';

const items: BiddingItem[] = JSON.parse(fs.readFileSync('scraper_result.json', 'utf8'));
const bad = items.filter(i => !shouldKeepBiddingItem(i));
console.log('現データで対象外判定:', bad.length);
for (const i of bad) {
  const text = [i.title, i.description || '', ...(i.tags || [])].join(' ');
  const hits = dataFilters.alwaysExcludeKeywords.filter(k => text.includes(k));
  console.log('-', i.municipality, i.announcementDate, i.title.slice(0, 40));
  console.log('   titleOnly keep:', shouldKeepItem(i.title), '| always-hits:', hits.join(','), '| desc:', (i.description||'').slice(0,80), '| tags:', (i.tags||[]).join(','));
}

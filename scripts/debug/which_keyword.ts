import axios from 'axios';
import * as cheerio from 'cheerio';
import { EXCLUSION_KEYWORDS } from '../../src/scrapers/common/filter';
import dataFilters from '../../config/data_filters.json';

async function main() {
  const HEADERS = { 'User-Agent': 'Mozilla/5.0' };
  const d = await axios.get('https://www.town.oji.nara.jp/kakuka/somu/somu/gyomuannai/nyuusatu/nyuusatukouhyou/11747.html', { headers: HEADERS });
  const $ = cheerio.load(d.data);
  const main = $('#contents').first().text().replace(/\s+/g, ' ').trim();
  const always = dataFilters.alwaysExcludeKeywords.filter(k => main.includes(k));
  const excl = EXCLUSION_KEYWORDS.filter(k => main.includes(k));
  console.log('alwaysExclude hits:', always);
  console.log('exclusion hits:', excl);
  console.log('full text:', main);
}
main();

import axios from 'axios';
import * as cheerio from 'cheerio';
import { shouldKeepItem } from '../../src/scrapers/common/filter';

async function main() {
  const HEADERS = { 'User-Agent': 'Mozilla/5.0' };
  const res = await axios.get('https://www.town.oji.nara.jp/kakuka/somu/somu/gyomuannai/nyuusatu/nyuusatukouhyou/index.tree.json', { headers: HEADERS });
  const july = res.data.find((p: any) => p.page_name.includes('7月'));
  console.log('entry:', july?.page_name, july?.url);
  const d = await axios.get(july.url, { headers: HEADERS });
  const $ = cheerio.load(d.data);
  const main = $('#contents').first().text().replace(/\s+/g, ' ').trim();
  console.log('h1:', $('h1').text().trim());
  console.log('contents:', main.slice(0, 500));
  const title = 'やわらぎ会館改修工事（7月）';
  console.log('keep(title):', shouldKeepItem(title));
  console.log('keep(title+contents):', shouldKeepItem(title, main));
  // find pdf links
  $('a').each((_, a) => { const h = $(a).attr('href'); if (h && h.includes('pdf')) console.log('pdf:', h); });
}
main();

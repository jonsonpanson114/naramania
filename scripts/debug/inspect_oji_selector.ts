import axios from 'axios';
import * as cheerio from 'cheerio';

async function main() {
  const res = await axios.get('https://www.town.oji.nara.jp/kakuka/somu/somu/gyomuannai/nyuusatu/nyuusatukouhyou/11512.html', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const $ = cheerio.load(res.data);
  for (const sel of ['#tmp_contents', '#contents', 'main', 'article', '.detail_free', '#main', '.contents']) {
    const el = $(sel);
    if (el.length) console.log(sel, '->', el.first().text().replace(/\s+/g, ' ').trim().slice(0, 200));
  }
}
main();

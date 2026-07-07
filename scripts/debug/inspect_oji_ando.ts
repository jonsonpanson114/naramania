import axios from 'axios';
import * as cheerio from 'cheerio';
import { shouldKeepItem } from '../../src/scrapers/common/filter';

const HEADERS = { 'User-Agent': 'Mozilla/5.0' };

async function main() {
  // 王寺 full tree json
  const res = await axios.get('https://www.town.oji.nara.jp/kakuka/somu/somu/gyomuannai/nyuusatu/nyuusatukouhyou/index.tree.json', { headers: HEADERS });
  console.log('--- 王寺 index.tree.json 全件:');
  for (const p of res.data) {
    const keep = shouldKeepItem(p.page_name);
    console.log(' ', p.publish_datetime?.slice(0,10), keep ? 'KEEP' : 'drop', '|', p.page_name);
  }
  // やわらぎ会館ページの現況
  const y = await axios.get('https://www.town.oji.nara.jp/kakuka/somu/somu/gyomuannai/nyuusatu/nyuusatukouhyou/11512.html', { headers: HEADERS }).catch(e => null);
  if (y) {
    const $ = cheerio.load(y.data);
    const body = $('body').text().replace(/\s+/g, ' ');
    console.log('--- やわらぎ会館 11512.html:');
    console.log('h1:', $('h1').text().trim());
    const idx = body.indexOf('やわらぎ');
    console.log(body.slice(Math.max(0, idx-100), idx+500));
  }
  // 安堵の2件が filter を通るか
  console.log('--- 安堵 filter check:');
  for (const t of [
    '【条件付き一般競争入札の結果】安堵こども園南館外壁改修、トイレ乾式化および洋式化改修工事',
    '【条件付き一般競争入札の結果】安堵町立安堵小中学校屋内運動場空調設備設置工事',
  ]) console.log(' ', shouldKeepItem(t) ? 'KEEP' : 'drop', '|', t);
}
main();

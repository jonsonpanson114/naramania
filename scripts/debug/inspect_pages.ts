import axios from 'axios';
import * as cheerio from 'cheerio';

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; naramania-scraper/1.0)' };

async function inspect(url: string, label: string) {
  try {
    const res = await axios.get(url, { timeout: 30000, headers: HEADERS });
    const $ = cheerio.load(res.data);
    console.log('\n===== ' + label + ' [' + res.status + '] ' + url);
    console.log('title:', $('title').text().trim());
    console.log('h1:', $('h1').first().text().trim());
    console.log('tables:', $('table').length, 'h2:', $('h2').length);
    console.log('h2 texts:', $('h2').map((_, e) => $(e).text().trim().slice(0, 40)).get().slice(0, 10).join(' / '));
    const body = $('body').text().replace(/\s+/g, ' ').slice(0, 600);
    console.log('body head:', body);
  } catch (e: any) {
    console.log('\n===== ' + label + ' ERROR: ' + (e.response?.status || e.message) + ' ' + url);
  }
}

async function main() {
  await inspect('https://www.city.yamatotakada.nara.jp/soshikikarasagasu/somuka/keiyakukanri/nyusatsu_keiyaku/2/1422.html', '高田:建設工事公告');
  await inspect('https://www.city.yamatotakada.nara.jp/soshikikarasagasu/somuka/keiyakukanri/nyusatsu_keiyaku/1/9099.html', '高田:入札結果');
  await inspect('https://www.town.ando.nara.jp/category/4-1-0-0-0-0-0-0-0-0.html', '安堵:カテゴリ');
  await inspect('https://www.town.oji.nara.jp/kakuka/somu/somu/gyomuannai/nyuusatu/nyuusatukouhyou/index.html', '王寺:公表index');
}
main();

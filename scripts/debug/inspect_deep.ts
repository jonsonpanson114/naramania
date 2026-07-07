import axios from 'axios';
import * as cheerio from 'cheerio';

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; naramania-scraper/1.0)' };

async function main() {
  // 1. 高田 announcement table rows
  {
    const res = await axios.get('https://www.city.yamatotakada.nara.jp/soshikikarasagasu/somuka/keiyakukanri/nyusatsu_keiyaku/2/1422.html', { headers: HEADERS });
    const $ = cheerio.load(res.data);
    console.log('--- 高田 公告 table rows:');
    $('table tr').each((i, row) => {
      const cells = $(row).find('td,th').map((_, c) => $(c).text().replace(/\s+/g, ' ').trim().slice(0, 30)).get();
      console.log(i, JSON.stringify(cells));
    });
  }
  // 2. 高田 入札結果の親ページから R8 リンク探し
  {
    const res = await axios.get('https://www.city.yamatotakada.nara.jp/soshikikarasagasu/somuka/keiyakukanri/nyusatsu_keiyaku/1/index.html', { headers: HEADERS }).catch(e => null);
    if (res) {
      const $ = cheerio.load(res.data);
      console.log('--- 高田 結果カテゴリのリンク:');
      $('a').each((_, a) => {
        const t = $(a).text().trim(); const h = $(a).attr('href');
        if (t.includes('入札結果') || t.includes('令和')) console.log(' ', t, '=>', h);
      });
    } else console.log('高田 結果カテゴリindex 取得失敗');
  }
  // 3. 安堵 カテゴリページのアンカー
  {
    const res = await axios.get('https://www.town.ando.nara.jp/category/4-1-0-0-0-0-0-0-0-0.html', { headers: HEADERS });
    const $ = cheerio.load(res.data);
    console.log('--- 安堵 カテゴリのアンカー(入札関連):');
    $('a').each((_, a) => {
      const t = $(a).text().replace(/\s+/g, ' ').trim(); const h = $(a).attr('href');
      if (t && (t.includes('入札') || t.includes('工事') || t.includes('契約'))) console.log(' ', t.slice(0, 70), '=>', h);
    });
  }
  // 4. 王寺 index.tree.json
  {
    const res = await axios.get('https://www.town.oji.nara.jp/kakuka/somu/somu/gyomuannai/nyuusatu/nyuusatukouhyou/index.tree.json', { headers: HEADERS }).catch(e => ({ data: 'ERR ' + (e.response?.status || e.message) }));
    console.log('--- 王寺 index.tree.json:');
    console.log(JSON.stringify(res.data).slice(0, 1500));
  }
}
main();

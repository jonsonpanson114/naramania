import axios from 'axios';
import * as cheerio from 'cheerio';

const HEADERS = { 'User-Agent': 'Mozilla/5.0' };

async function anchors(url: string, label: string, filter: (t: string) => boolean) {
  try {
    const res = await axios.get(url, { headers: HEADERS, timeout: 20000 });
    const $ = cheerio.load(res.data);
    console.log('\n=== ' + label + ' [' + res.status + ']');
    const seen = new Set<string>();
    $('a').each((_, a) => {
      const t = $(a).text().replace(/\s+/g, ' ').trim();
      const h = $(a).attr('href') || '';
      if (t && filter(t) && !seen.has(t + h)) { seen.add(t + h); console.log(' ', t.slice(0, 70), '=>', h.slice(0, 80)); }
    });
  } catch (e: any) {
    console.log('\n=== ' + label + ' ERROR:', e.response?.status || e.message);
  }
}

async function main() {
  await anchors('https://www.town.koryo.nara.jp/category/19-4-2-0-0-0-0-0-0-0.html', '広陵町カテゴリ', t => t.includes('入札結果') || t.includes('令和'));
  await anchors('https://www.town.miyake.lg.jp/soshiki/1/index.html', '三宅町 総務課', t => t.includes('入札') || t.includes('工事') || t.includes('公告'));
  await anchors('https://www.town.heguri.nara.jp/soshiki/list7-1.html', '平群町 一覧', t => t.includes('入札') || t.includes('工事') || t.includes('設計'));
  await anchors('https://www.vill.yamazoe.nara.jp/life/news', '山添村 news', t => t.includes('入札') || t.includes('工事'));
  await anchors('https://www.town.oyodo.lg.jp/contents_detail.php?frmId=218', '大淀町 受付中', t => t.length > 8);
}
main();

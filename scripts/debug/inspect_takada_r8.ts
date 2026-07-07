import axios from 'axios';
import * as cheerio from 'cheerio';

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; naramania-scraper/1.0)' };

async function main() {
  const res = await axios.get('https://www.city.yamatotakada.nara.jp/soshikikarasagasu/somuka/keiyakukanri/nyusatsu_keiyaku/1/10344.html', { headers: HEADERS });
  const $ = cheerio.load(res.data);
  console.log('h1:', $('h1').text().trim());
  $('h2').each((_, h2) => {
    const t = $(h2).text().replace(/\s+/g, '').trim();
    if (!/月/.test(t)) return;
    console.log('== h2:', t);
    let nextEl = $(h2).next();
    while (nextEl.length > 0 && nextEl[0]?.tagName !== 'h2') {
      if (nextEl.is('div.wysiwyg')) {
        const title = nextEl.find('p strong').first().text().replace(/\s+/g, ' ').trim();
        let contractor = '';
        nextEl.find('table tr').each((_, tr) => {
          const tds = $(tr).find('td');
          if (tds.length >= 2) {
            const label = tds.eq(0).text().replace(/\s+/g, '').trim();
            if (label === '落札業者' || label === '落札者') contractor = tds.eq(1).text().replace(/\s+/g, ' ').trim();
          }
        });
        if (title) console.log('   item:', title, '| 落札:', contractor || '(なし)');
      }
      nextEl = nextEl.next();
    }
  });
}
main();

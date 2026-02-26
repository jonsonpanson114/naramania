const axios = require('axios');
const cheerio = require('cheerio');

(async () => {
  const rssUrl = 'https://www.town.ando.nara.jp/rss/rss.xml';
  const res = await axios.get(rssUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
  const $ = cheerio.load(res.data, { xmlMode: true });

  console.log('[安堵町 RSS フィード]');

  // 全アイテムを表示
  console.log('\n--- All RSS Items ---');
  $('item').each((i, el) => {
    const title = $(el).find('title').text().trim();
    const link = $(el).find('link').text().trim();
    const date = $(el).find('pubDate').text().trim();

    console.log(`  [${i+1}] ${title}`);
    console.log(`       Link: ${link}`);
    if (date) console.log(`       Date: ${date}`);
  });
})();

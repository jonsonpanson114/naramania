const axios = require('axios');
const cheerio = require('cheerio');

(async () => {
  // RSSフィードを確認
  const rssUrl = 'https://www.town.ando.nara.jp/rss/rss.xml';
  const res = await axios.get(rssUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
  console.log('[安堵町 RSS]');
  const $ = cheerio.load(res.data, { xmlMode: true });

  console.log('\n--- RSS Items ---');
  $('item').each((i, el) => {
    const title = $(el).find('title').text().trim();
    const link = $(el).find('link').text().trim();
    const date = $(el).find('pubDate').text().trim();

    // 入札関連の項目を表示
    if (title.includes('入札') || title.includes('契約') || title.includes('落札') || title.includes('工事')) {
      console.log(`  [${i+1}] ${title}`);
      console.log(`       Link: ${link}`);
      if (date) console.log(`       Date: ${date}`);
    }
  });
})();

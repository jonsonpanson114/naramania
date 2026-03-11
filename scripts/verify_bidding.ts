import { TakatoriTownScraper, IkarugaTownScraper } from './src/scrapers/takatori_ikaruga';

async function verify() {
  console.log('=== 高取町 詳細確認 ===');
  const scraper1 = new TakatoriTownScraper();
  const items1 = await scraper1.scrape();
  console.log(`取得件数: ${items1.length}`);
  items1.forEach((item, i) => {
    console.log(`  [${i+1}] ${item.title}`);
    console.log(`       URL: ${item.link}`);
    console.log(`       ステータス: ${item.status}`);
    console.log(`       タイプ: ${item.type}`);
    console.log(`       公告日: ${item.announcementDate}`);
  });

  console.log('\n=== 斑鳩町 詳細確認 ===');
  const scraper2 = new IkarugaTownScraper();
  const items2 = await scraper2.scrape();
  console.log(`取得件数: ${items2.length}`);
  items2.forEach((item, i) => {
    console.log(`  [${i+1}] ${item.title}`);
    console.log(`       URL: ${item.link}`);
    console.log(`       ステータス: ${item.status}`);
    console.log(`       タイプ: ${item.type}`);
    console.log(`       公告日: ${item.announcementDate}`);
  });
}

verify();

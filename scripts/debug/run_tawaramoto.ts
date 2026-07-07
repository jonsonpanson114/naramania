import { TawaramotoTownScraper } from '../../src/scrapers/tawaramoto_town';
new TawaramotoTownScraper().scrape().then(items => {
  console.log('=== 田原本町: ' + items.length);
  for (const i of items) console.log('  ', i.announcementDate, '|', i.biddingDate || '-', '|', i.status, '|', i.title.slice(0, 50));
});

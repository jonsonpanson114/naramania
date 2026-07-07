import { MiyakeCityScraper } from '../../src/scrapers/miyake_city';
new MiyakeCityScraper().scrape().then(items => {
  console.log('=== 三宅町: ' + items.length);
  for (const i of items) console.log('  ', i.announcementDate, '|', i.status, '|', (i.winningContractor||'') , '|', i.title.slice(0, 60));
});

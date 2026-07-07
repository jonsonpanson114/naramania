import { KoryoTownScraper } from '../../src/scrapers/koryo_town';
import { YamazomuraScraper, HiragawaScraper } from '../../src/scrapers/yamazohiragawa_city';
import { OyodoTownScraper } from '../../src/scrapers/oyodo_town';
import { MiyakeCityScraper } from '../../src/scrapers/miyake_city';

async function main() {
  for (const S of [KoryoTownScraper, YamazomuraScraper, HiragawaScraper, OyodoTownScraper, MiyakeCityScraper]) {
    const s = new S();
    try {
      const items = await s.scrape();
      console.log('=== ' + s.municipality + ': ' + items.length + ' items');
      for (const i of items) console.log('  ', i.announcementDate, '|', i.status, '|', (i.winningContractor||'').slice(0,20), '|', i.title.slice(0, 55));
    } catch (e) {
      console.log('=== ' + s.municipality + ' threw:', (e as Error).message);
    }
  }
}
main();

import { YamatoTakadaCityScraper } from '../../src/scrapers/yamato_takada_city';
import { AndoCityScraper } from '../../src/scrapers/ando_city';
import { OjiTownScraper } from '../../src/scrapers/oji_town';

async function main() {
  for (const S of [YamatoTakadaCityScraper, AndoCityScraper, OjiTownScraper]) {
    const s = new S();
    try {
      const items = await s.scrape();
      console.log('=== ' + s.municipality + ': ' + items.length + ' items');
      for (const i of items) console.log('  ', i.announcementDate, '|', i.status, '|', i.title.slice(0, 60));
    } catch (e) {
      console.log('=== ' + s.municipality + ' threw:', (e as Error).message);
    }
  }
}
main();

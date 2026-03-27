import { KashibaCityScraper } from './src/scrapers/kashiba_city';

async function test() {
    const kashiba = new KashibaCityScraper();
    console.log('--- Testing Kashiba ---');
    const items = await kashiba.scrape();
    console.log(`Kashiba Items: ${items.length}`);
    items.forEach(i => console.log(` - ${i.title} (${i.announcementDate})`));
}

test();

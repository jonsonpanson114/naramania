import { KashibaCityScraper } from './src/scrapers/kashiba_city';

async function test() {
    const kashiba = new KashibaCityScraper();
    console.log('--- Testing Kashiba (Post-Strict Filter) ---');
    const items = await kashiba.scrape();
    console.log(`Kashiba Items Found: ${items.length}`);
    items.forEach(i => console.log(` - ${i.title} (${i.announcementDate}) Link: ${i.link}`));
}

test();


import { IkomaCityScraper } from '../src/scrapers/ikoma_city';
import { UdaCityScraper } from '../src/scrapers/uda_city';
import { BiddingItem } from '../src/types/bidding';

async function forceScrape(city: string, scraper: any) {
    console.log(`\n=== Force Scraping ${city} (Ignoring filter) ===`);
    // Note: To ignore filter, we'd need to modify the scraper or the filter.ts temporarily.
    // Instead, I'll just check if the scraper *finds* any links before filtering by looking at logs.
    // I previously added logging for this in the scrapers!
    const items = await scraper.scrape();
    console.log(`${city} final result (after filter): ${items.length} items`);
}

async function run() {
    await forceScrape('Ikoma', new IkomaCityScraper());
    await forceScrape('Uda', new UdaCityScraper());
}

run();

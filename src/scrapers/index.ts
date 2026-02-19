import { NaraPrefScraper } from './nara_pref';
import { NaraCityScraper } from './nara_city';
import { KashiharaCityScraper } from './kashihara_city';
import { IkomaCityScraper } from './ikoma_city';
import { BiddingItem } from '../types/bidding';

async function main() {
    console.log('Starting Scrapers...');

    const scrapers = [
        new NaraPrefScraper(),
        new NaraCityScraper(),
        new KashiharaCityScraper(),
        new IkomaCityScraper(),
    ];

    const allItems: BiddingItem[] = [];

    for (const scraper of scrapers) {
        console.log(`Scraping ${scraper.municipality}...`);
        try {
            const items = await scraper.scrape();
            console.log(`Found ${items.length} items from ${scraper.municipality}.`);
            allItems.push(...items);
        } catch (error) {
            console.error(`Failed to scrape ${scraper.municipality}:`, error);
        }
    }

    console.log('--- Aggregation Complete ---');
    console.log(`Total Items: ${allItems.length}`);
    console.log(JSON.stringify(allItems, null, 2));
}

main().catch(console.error);

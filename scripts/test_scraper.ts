
import { NaraPrefScraper } from './src/scrapers/nara_pref';
import { NaraCityScraper } from './src/scrapers/nara_city';
import { KashiharaCityScraper } from './src/scrapers/kashihara_city';
import { IkomaCityScraper } from './src/scrapers/ikoma_city';
import fs from 'fs';

async function main() {
    console.log('### Starting FINAL Global Scraper Test ###');

    const scrapers = [
        new NaraPrefScraper(),
        new NaraCityScraper(),
        new KashiharaCityScraper(),
        new IkomaCityScraper()
    ];

    let allItems: any[] = [];

    for (const scraper of scrapers) {
        console.log(`Running Scraper for: ${scraper.municipality}...`);
        try {
            const items = await scraper.scrape();
            allItems = [...allItems, ...items];
            console.log(`- Found ${items.length} items.`);
        } catch (e) {
            console.error(`- Error in ${scraper.municipality}:`, e);
        }
    }

    fs.writeFileSync('scraper_result.json', JSON.stringify(allItems, null, 2));

    console.log(`### ALL DONE ###`);
    console.log(`Total Aggregated Items: ${allItems.length}`);
    console.log('Results saved to scraper_result.json');
}
main();

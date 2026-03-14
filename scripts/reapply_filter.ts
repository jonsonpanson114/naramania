import fs from 'fs';
import path from 'path';
import { shouldKeepItem } from '../src/scrapers/common/filter';
import { BiddingItem } from '../src/types/bidding';

const RESULT_PATH = path.join(process.cwd(), 'scraper_result.json');

function main() {
    if (!fs.existsSync(RESULT_PATH)) {
        console.error('scraper_result.json is not found.');
        return;
    }

    const rawData = fs.readFileSync(RESULT_PATH, 'utf-8');
    const items: BiddingItem[] = JSON.parse(rawData);

    const originalCount = items.length;
    const filteredItems = items.filter(item => {
        const textToMatch = [
            item.title,
            item.description || '',
            item.winningContractor || '',
            ...(item.tags || [])
        ].join(' ');
        
        return shouldKeepItem(textToMatch);
    });

    const newCount = filteredItems.length;
    const removedCount = originalCount - newCount;

    console.log(`Original Count: ${originalCount}`);
    console.log(`New Count: ${newCount}`);
    console.log(`Removed: ${removedCount} items`);

    if (removedCount > 0) {
        fs.writeFileSync(RESULT_PATH, JSON.stringify(filteredItems, null, 2), 'utf-8');
        console.log('scraper_result.json has been updated.');
    } else {
        console.log('No elements were removed.');
    }
}

main();

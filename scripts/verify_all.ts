
import { IkomaCityScraper } from '../src/scrapers/ikoma_city';
import { UdaCityScraper } from '../src/scrapers/uda_city';
import fs from 'fs';

async function verifyAll() {
    console.log('--- Verification Run Start ---');
    
    console.log('Running Ikoma...');
    const ikomaItems = await new IkomaCityScraper().scrape();
    console.log(`Ikoma Result: ${ikomaItems.length} items`);
    
    console.log('Running Uda...');
    const udaItems = await new UdaCityScraper().scrape();
    console.log(`Uda Result: ${udaItems.length} items`);
    
    const summary = `Ikoma: ${ikomaItems.length}\nUda: ${udaItems.length}\nTimestamp: ${new Date().toISOString()}`;
    fs.writeFileSync('verify_result.txt', summary);
    console.log('Summary saved to verify_result.txt');
}

verifyAll();

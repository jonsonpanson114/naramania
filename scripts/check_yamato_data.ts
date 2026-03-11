import fs from 'fs';
import path from 'path';

const RESULT_PATH = path.join(process.cwd(), 'scraper_result.json');

function main() {
    const data = JSON.parse(fs.readFileSync(RESULT_PATH, 'utf-8'));
    const yamato = data.filter((item: any) => item.municipality === '大和郡山市');
    const won = yamato.filter((item: any) => item.status === '落札');
    const withWinner = won.filter((item: any) => item.winningContractor);

    console.log(`Summary for Yamatokoriyama:`);
    console.log(`  Total items: ${yamato.length}`);
    console.log(`  Won items: ${won.length}`);
    console.log(`  Items with winningContractor: ${withWinner.length}`);

    if (won.length > withWinner.length) {
        console.log(`  Warning: ${won.length - withWinner.length} items are missing a winner.`);
    }

    // Sample output
    console.log('\nSample items:');
    console.log(JSON.stringify(yamato.slice(0, 3), null, 2));
}

main();

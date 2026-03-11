import { readFileSync } from 'fs';

const d = JSON.parse(readFileSync('scraper_result.json', 'utf8'));
const nara = d.filter((i: any) => i.municipality === '奈良県');
const w = nara.filter((i: any) => i.status === '落札');
const withC = w.filter((i: any) => i.winningContractor);
const noC = w.filter((i: any) => !i.winningContractor);

console.log('奈良県案件数:', nara.length);
console.log('落札案件数:', w.length);
console.log('落札者あり:', withC.length);
console.log('落札者なし:', noC.length);
console.log('');

if (noC.length > 0) {
    console.log('落札者なしの案件:');
    noC.forEach((i: any) => {
        console.log('  -', i.title.substring(0, 60));
    });
}

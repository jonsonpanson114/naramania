import { readFileSync } from 'fs';

interface BiddingItem {
    municipality: string;
    status: string;
    title: string;
    winningContractor?: string;
}

const d = JSON.parse(readFileSync('scraper_result.json', 'utf8')) as BiddingItem[];
const nara = d.filter(i => i.municipality === '奈良県');
const w = nara.filter(i => i.status === '落札');
const withC = w.filter(i => i.winningContractor);

console.log('奈良県案件数:', nara.length);
console.log('落札案件数:', w.length);
console.log('落札者あり:', withC.length);
console.log('');

console.log('奈良県落札案件（最新）:');
w.filter(i => i.winningContractor).slice(0, 10).forEach((i, idx: number) => {
    console.log(`${idx + 1}. ${i.winningContractor}`);
    console.log(`   ${i.title.substring(0, 50)}`);
});

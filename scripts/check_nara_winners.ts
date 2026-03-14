import { readFileSync } from 'fs';

const data = JSON.parse(readFileSync('scraper_result.json', 'utf8'));
const w = data.filter((i: any) => i.municipality === '奈良県' && i.status === '落札');
const without = w.filter((i: any) => !i.winningContractor);

console.log('奈良県落札案件数:', w.length);
console.log('落札者なし:', without.length);

if (without.length > 0) {
  console.log('\n落札者なしの案件:');
  console.log(JSON.stringify(without.map((i: any) => ({ id: i.id, title: i.title })), null, 2));
}

console.log('\n最初の5件の落札案件:');
w.slice(0, 5).forEach((i: any, idx: number) => {
  console.log(`${idx + 1}. ${i.winningContractor || '(なし)'} - ${i.title.substring(0, 30)}...`);
});

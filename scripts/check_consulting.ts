import { readFileSync } from 'fs';

const d = JSON.parse(readFileSync('scraper_result.json', 'utf8'));
const w = d.filter((i: any) => i.municipality === '奈良県' && i.status === '落札' && i.type === 'コンサル');

console.log('奈良県コンサル落札案件（' + w.length + '件）:\n');

// 測量等のキーワード
const keywords = ['測量', '橋', '舗装', '鋼', 'PC', '造園', '法面', '土木', '道路', '登記', '治山'];

w.forEach((i: any, idx: number) => {
    const hasKeyword = keywords.some(k => i.title.includes(k));
    console.log(`${idx + 1}. ${i.winningContractor ? '✓' : '✗'} ${hasKeyword ? '★' : ' '} ${i.title.substring(0, 55)}`);
    if (hasKeyword) {
        console.log(`   → 含むキーワード: ${keywords.filter(k => i.title.includes(k)).join(', ')}`);
    }
    if (i.winningContractor) {
        console.log(`   落札者: ${i.winningContractor}`);
        console.log(`   価格: ${i.estimatedPrice || '-'}`);
    }
    console.log('');
});

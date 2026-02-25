const fs = require('fs');
const data = JSON.parse(fs.readFileSync('scraper_result.json'));
const nara = data.filter(d => d.municipality === '奈良県' && d.winningContractor);
console.log('--- NARA PREF INTELLIGENCE STATUS ---');
const yonesugi = nara.filter(d => d.winningContractor.includes('米杉') || d.winningContractor.includes('米 杉'));
console.log(`Total Nara with intel: ${nara.length}`);
console.log(`Total Yonesugi: ${yonesugi.length}`);
console.log(yonesugi.slice(0, 3).map(d => `${d.title} -> ${d.winningContractor}`).join('\n'));

console.log('\n--- CIVIL CHECK ---');
const civilKws = ['土木', '舗装', '法面', '河川', '砂防', '造園', '水道', '管工', 'さく井', '橋梁', '除草', '草刈', '剪定', '下水道', '排水', '擁壁'];
const archKws = ['建築', '空調', '便所', 'トイレ', '内装', '外壁', '防水', '屋上', '照明', '受変電', 'エレベーター', 'EV', '体育館', '校舎', '住宅', '長寿命化'];

let civilItems = data.filter(d => {
    // If explicitly Architectural, keep it.
    if (archKws.some(kw => d.title.includes(kw))) return false;
    return civilKws.some(kw => d.title.includes(kw));
});

console.log(`Found ${civilItems.length} likely civil engineering items.`);
console.dir(civilItems.slice(0, 5).map(d => `[${d.municipality}] ${d.title}`));

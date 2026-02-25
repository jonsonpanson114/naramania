const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, 'scraper_result.json');
let data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

const originalLength = data.length;

// Keywords for filtering
const civilKws = ['土木', '舗装', '法面', '河川', '砂防', '造園', '水道', '管工', 'さく井', '橋梁', '除草', '草刈', '剪定', '下水道', '排水', '擁壁', '水路', '側溝', '堤防', '池', '林道', '農道', '防犯灯', '道路', '舗装', '橋梁', '防護柵', '標識', '街路樹'];
const archKws = ['建築', '空調', '便所', 'トイレ', '内装', '外壁', '防水', '屋上', '照明', '受変電', 'エレベーター', 'EV', '体育館', '校舎', '住宅', '長寿命化', '公民館', '消防', '改修', '塗装'];

data = data.filter(d => {
    // Keep it if it has an architectural keyword
    if (archKws.some(kw => d.title.includes(kw))) return true;
    // Remove if it has a civil engineering keyword
    if (civilKws.some(kw => d.title.includes(kw))) return false;
    return true;
});

let wipedCount = 0;

// Reset intelligence for ALL Nara Prefecture items to be safe, because the PDF was mismatched!
data = data.map(d => {
    if (d.municipality === '奈良県' && d.isIntelligenceExtracted) {
        d.isIntelligenceExtracted = false;
        delete d.winningContractor;
        delete d.contractor;
        delete d.estimatedPrice;
        delete d.designFirm;
        delete d.constructionPeriod;
        delete d.description;
        wipedCount++;
    }
    return d;
});

fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8');

console.log(`Removed ${originalLength - data.length} civil engineering items.`);
console.log(`Reset intelligence for ${wipedCount} Nara Prefecture items due to previous PDF mismatch bug.`);
console.log(`Remaining items in dataset: ${data.length}`);

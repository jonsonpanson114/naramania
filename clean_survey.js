const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, 'scraper_result.json');
let data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

const originalLength = data.length;

// Filter out 測量
const surveyKws = ['測量', '地質', '地盤', '土質', 'ボーリング'];
data = data.filter(d => !surveyKws.some(kw => d.title.includes(kw)));

console.log(`Removed ${originalLength - data.length} survey/geological items.`);

const nara = data.filter(d => d.municipality === '奈良県');
const naraExtracted = nara.filter(d => d.isIntelligenceExtracted);
const naraAwarded = nara.filter(d => d.status === '落札');

console.log(`Total Nara: ${nara.length}, Awarded: ${naraAwarded.length}, Intel Extracted: ${naraExtracted.length}`);

fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8');

const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, 'scraper_result.json');
let data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

let count = 0;
data.forEach(d => {
    if (d.municipality === '奈良県' && d.description === 'PDF extraction failed or empty.') {
        d.isIntelligenceExtracted = false;
        delete d.description;
        count++;
    }
});

console.log(`Reset ${count} broken Nara Pref properties.`);
fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8');

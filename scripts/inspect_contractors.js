const fs = require('fs');
const data = JSON.parse(fs.readFileSync('scraper_result.json'));
const nara = data.filter(d => d.municipality === '奈良県' && d.winningContractor);
console.log('--- NARA PREF EXTRACTED CONTRACTORS ---');
console.log(nara.map(d => `[${d.id}] ${d.title} -> ${d.winningContractor}`).join('\n'));

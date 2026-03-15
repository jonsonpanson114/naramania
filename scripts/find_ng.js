const fs = require('fs');
const data = JSON.parse(fs.readFileSync('scraper_result.json', 'utf8'));
const keywords = ['土砂', 'バス', '汚泥', '落石', '道路'];
const results = data.filter(item => {
    const text = JSON.stringify(item);
    return keywords.some(kw => text.includes(kw));
});
console.log(JSON.stringify(results.map(r => ({id: r.id, title: r.title, municipality: r.municipality})), null, 2));

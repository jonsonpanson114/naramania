const fs = require('fs');
const path = require('path');

const filePath = 'c:/Users/jonso/.gemini/antigravity/playground/azimuthal-pioneer/naramania/scraper_result.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

const total = data.length;
const extracted = data.filter(i => i.isIntelligenceExtracted).length;
const hasPdf = data.filter(i => i.pdfUrl && i.pdfUrl !== '').length;
const pending = data.filter(i => i.pdfUrl && i.pdfUrl !== '' && !i.isIntelligenceExtracted).length;

console.log('Total Items:', total);
console.log('Extracted (Gemini):', extracted);
console.log('Has PDF:', hasPdf);
console.log('Pending Extraction:', pending);

// Check if winningContractor exists but no isIntelligenceExtracted
const hasWinnerNoIntel = data.filter(i => i.winningContractor && !i.isIntelligenceExtracted).length;
console.log('Has winningContractor but NO isIntelligenceExtracted flag:', hasWinnerNoIntel);

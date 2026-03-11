const fs = require('fs');

const currentPath = 'scraper_result.json';
const backupPath = 'scraper_result_backup_f92.json';

const current = JSON.parse(fs.readFileSync(currentPath, 'utf-8'));
const backup = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));

const backupMap = new Map();
backup.forEach(item => {
    if (item.isIntelligenceExtracted) {
        backupMap.set(item.id, item);
    }
});

let restoredCount = 0;
const merged = current.map(item => {
    const backupItem = backupMap.get(item.id);
    if (backupItem) {
        restoredCount++;
        return {
            ...item,
            isIntelligenceExtracted: true,
            estimatedPrice: backupItem.estimatedPrice,
            winningContractor: backupItem.winningContractor,
            designFirm: backupItem.designFirm,
            constructionPeriod: backupItem.constructionPeriod,
            description: backupItem.description,
            winnerType: backupItem.winnerType
        };
    }
    return item;
});

fs.writeFileSync(currentPath, JSON.stringify(merged, null, 2), 'utf-8');
console.log(`Successfully merged ${restoredCount} items back into ${currentPath}`);

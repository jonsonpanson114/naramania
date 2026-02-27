import fs from 'fs';
import { isCivilEngineering } from './src/scrapers/common/filter';

const RESULT_PATH = 'scraper_result.json';

if (!fs.existsSync(RESULT_PATH)) {
    console.error('scraper_result.json not found.');
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(RESULT_PATH, 'utf-8'));
console.log(`Original count: ${data.length} items`);

const cleaned = data.filter((item: any) => {
    const title = item.title || '';
    const gyoshu = item.type || '';
    const description = item.description || '';
    const combined = `${title} ${gyoshu} ${description}`;

    // 強力なキーワード除外 (filter.ts を使用)
    if (isCivilEngineering(combined)) {
        console.log(`[DELETE] ${item.id}: ${title.substring(0, 30)} (Reason: Civil/Survey Keyword)`);
        return false;
    }

    // 特定の不純物ワードをさらに追加
    const toxicKeywords = [
        '測量', '国道', '地下水位', '汚水', '下水', '上水', '道路', '橋', '河川', 'ダム', '砂防', '舗装', '法面', '側溝', '水路', '堤防', '標識', '街灯', '信号', '除草', '地質調査', '用地調査', '物件調査', '境界', '地図', '流量', '騒音', '振動', 'アセスメント',
        '保安', '警備', '維持管理', '清掃', '修繕（道路）', '日本道路保安'
    ];
    
    if (toxicKeywords.some(kw => combined.includes(kw))) {
        console.log(`[DELETE] ${item.id}: ${title.substring(0, 30)} (Reason: Toxic Keyword)`);
        return false;
    }

    return true;
});

console.log(`\nCleanup complete: ${cleaned.length} items remaining.`);
console.log(`Removed ${data.length - cleaned.length} items.`);

fs.writeFileSync(RESULT_PATH, JSON.stringify(cleaned, null, 2));
console.log('Successfully updated scraper_result.json');

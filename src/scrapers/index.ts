import { NaraPrefScraper } from './nara_pref';
import { NaraCityScraper } from './nara_city';
import { KashiharaCityScraper } from './kashihara_city';
import { IkomaCityScraper } from './ikoma_city';
import { BiddingItem } from '../types/bidding';
import fs from 'fs';
import path from 'path';

async function main() {
    console.log('=== スクレイピング開始 ===');

    const scrapers = [
        new NaraPrefScraper(),
        new NaraCityScraper(),
        new KashiharaCityScraper(),
        new IkomaCityScraper(),
    ];

    const allItems: BiddingItem[] = [];

    for (const scraper of scrapers) {
        console.log(`\n--- ${scraper.municipality} 開始 ---`);
        try {
            const items = await scraper.scrape();
            console.log(`→ ${scraper.municipality}: ${items.length}件取得`);
            allItems.push(...items);
        } catch (error) {
            console.error(`✗ ${scraper.municipality} 失敗:`, error);
        }
    }

    // 重複除外（同じIDのものを除く）
    const seen = new Set<string>();
    const unique = allItems.filter(item => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
    });

    // 公告日の降順でソート
    unique.sort((a, b) =>
        new Date(b.announcementDate).getTime() - new Date(a.announcementDate).getTime()
    );

    console.log('\n=== 集計完了 ===');
    console.log(`合計: ${unique.length} 件（重複除外後）`);

    // scraper_result.json に保存（プロジェクトルート）
    const outputPath = path.join(process.cwd(), 'scraper_result.json');
    fs.writeFileSync(outputPath, JSON.stringify(unique, null, 2), 'utf-8');
    console.log(`結果を保存: ${outputPath}`);

    // 内訳表示
    const byMunicipality: Record<string, number> = {};
    unique.forEach(item => {
        byMunicipality[item.municipality] = (byMunicipality[item.municipality] || 0) + 1;
    });
    console.log('\n自治体別件数:');
    Object.entries(byMunicipality).forEach(([m, count]) => {
        console.log(`  ${m}: ${count}件`);
    });
}

main().catch(console.error);

import { NaraPrefScraper } from './nara_pref';
import { NaraCityScraper } from './nara_city';
import { KashiharaCityScraper } from './kashihara_city';
import { IkomaCityScraper } from './ikoma_city';
import { YamatoTakadaCityScraper } from './yamato_takada_city';
import { YamatokoriyamaCityScraper } from './yamatokoriyama_city';
import { KatsuragiCityScraper } from './katsuragi_city';
import { GojoCityScraper } from './gojo_city';
import { TenriCityScraper } from './tenri_city';
import { SakuraiCityScraper } from './sakurai_city';
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
        new YamatoTakadaCityScraper(),
        new YamatokoriyamaCityScraper(),
        new KatsuragiCityScraper(),
        new GojoCityScraper(),
        new TenriCityScraper(),
        new SakuraiCityScraper(),
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

    // 重複除外（同じIDで複数ある場合は落札ステータスを優先）
    // 落札で上書きする際、受付中データのbiddingDate（入札予定日）を引き継ぐ
    const outputPath = path.join(process.cwd(), 'scraper_result.json');
    let existingData: Record<string, BiddingItem> = {};
    if (fs.existsSync(outputPath)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
            parsed.forEach((d: BiddingItem) => existingData[d.id] = d);
        } catch (e) { }
    }

    const seen = new Map<string, BiddingItem>();
    allItems.forEach(item => {
        const existing = seen.get(item.id) || existingData[item.id];

        // Preserve intelligence if it exists
        const preservedIntelligence = existing && existing.isIntelligenceExtracted ? {
            isIntelligenceExtracted: true,
            estimatedPrice: existing.estimatedPrice,
            winningContractor: existing.winningContractor,
            designFirm: existing.designFirm,
            constructionPeriod: existing.constructionPeriod,
            description: existing.description,
            // also preserve link and pdf fields if better
            pdfUrl: existing.pdfUrl || item.pdfUrl
        } : { isIntelligenceExtracted: false };

        if (!existing) {
            seen.set(item.id, { ...item, ...preservedIntelligence });
        } else if (item.status === '落札' || !existing.status || existing.status === '受付中') {
            seen.set(item.id, {
                ...existing,
                ...item,
                biddingDate: item.biddingDate ?? existing.biddingDate,
                ...preservedIntelligence,
            });
        }
    });

    // Also bring back existing items that were NOT found in this run (so we don't lose old records!)
    Object.values(existingData).forEach(ex => {
        if (!seen.has(ex.id)) {
            seen.set(ex.id, ex);
        }
    });
    const unique = Array.from(seen.values());

    // 公告日の降順でソート
    unique.sort((a, b) =>
        new Date(b.announcementDate).getTime() - new Date(a.announcementDate).getTime()
    );

    console.log('\n=== 集計完了 ===');
    console.log(`合計: ${unique.length} 件（重複除外後）`);

    // scraper_result.json に保存（プロジェクトルート）
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

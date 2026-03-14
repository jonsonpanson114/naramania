import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { YamatokoriyamaCityScraper } from './src/scrapers/yamatokoriyama_city';
import fs from 'fs';
import path from 'path';

const RESULT_PATH = path.join(process.cwd(), 'scraper_result.json');

async function main() {
    console.log('=== 大和郡山市 スクレイピング開始 ===');

    // 既存データを読み込む
    const existing: any[] = JSON.parse(fs.readFileSync(RESULT_PATH, 'utf-8'));
    const existingIds = new Set(existing.map((x: any) => x.id));

    const scraper = new YamatokoriyamaCityScraper();
    const items = await scraper.scrape();

    console.log(`取得: ${items.length}件`);

    // 新規追加または既存の更新
    let added = 0;
    let updated = 0;
    const existingMap = new Map(existing.map((x: any) => [x.id, x]));

    for (const item of items) {
        if (!existingMap.has(item.id)) {
            existing.push(item);
            existingMap.set(item.id, item);
            added++;
        } else {
            // 既存がある場合、情報のマージを試みる
            const target = existingMap.get(item.id);
            let changed = false;

            if (item.winningContractor && !target.winningContractor) {
                target.winningContractor = item.winningContractor;
                changed = true;
            }
            if (item.biddingDate && !target.biddingDate) {
                target.biddingDate = item.biddingDate;
                changed = true;
            }
            // ステータスが受付中から落札に変わった場合なども考慮
            if (item.status === '落札' && target.status === '受付中') {
                target.status = '落札';
                changed = true;
            }

            if (changed) updated++;
        }
    }

    // 公告日降順ソート
    existing.sort((a: any, b: any) =>
        new Date(b.announcementDate).getTime() - new Date(a.announcementDate).getTime()
    );

    fs.writeFileSync(RESULT_PATH, JSON.stringify(existing, null, 2), 'utf-8');
    console.log(`新規追加: ${added}件 / 既存スキップ: ${items.length - added}件`);
    console.log('保存完了。');
}

main().catch(console.error);

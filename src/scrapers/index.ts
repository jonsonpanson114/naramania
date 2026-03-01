import { NaraPrefScraper } from './nara_pref';
import { NaraCityScraper } from './nara_city';
import { KashiharaCityScraper } from './kashihara_city';
import { IkomaCityScraper } from './ikoma_city';
import { YamatoTakadaCityScraper } from './yamato_takada_city';
import { YamatokoriyamaCityScraper } from './yamatokoriyama_city';
import { KatsuragiCityScraper } from './katsuragi_city';
import { GojoCityScraper } from './gojo_city';
import { GoseCityScraper } from './gose_city';
import { TenriCityScraper } from './tenri_city';
import { SakuraiCityScraper } from './sakurai_city';
import { TawaramotoTownScraper } from './tawaramoto_town';
import { KoryoTownScraper } from './koryo_town';
import { KashibaCityScraper } from './kashiba_city';
import { KawanishiCityScraper } from './kawanishi_city';
import { MiyakeCityScraper } from './miyake_city';
import { YamazomuraScraper, HiragawaScraper } from './yamazohiragawa_city';
import { AndoCityScraper } from './ando_city';
import { TakatoriTownScraper, IkarugaTownScraper } from './takatori_ikaruga';
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
        new GoseCityScraper(),
        new TenriCityScraper(),
        new SakuraiCityScraper(),
        new TawaramotoTownScraper(),
        new KoryoTownScraper(),
        new KashibaCityScraper(),
        new KawanishiCityScraper(),
        new YamazomuraScraper(),
        new HiragawaScraper(),
        new MiyakeCityScraper(),
        new AndoCityScraper(),
        new TakatoriTownScraper(),
        new IkarugaTownScraper(),
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

    const outputPath = path.join(process.cwd(), 'scraper_result.json');

    // 既存データを読み込んで、AI抽出済みや落札者ありのものを保護する
    let existingItems: BiddingItem[] = [];
    if (fs.existsSync(outputPath)) {
        try {
            const content = fs.readFileSync(outputPath, 'utf-8');
            existingItems = JSON.parse(content);
        } catch (e) {
            console.warn('既存データの読み込みに失敗しました。');
        }
    }

    // 重複除外 & マージ
    const seen = new Map<string, BiddingItem>();

    // 既存データを先にMapに入れる（AI抽出フラグや落札情報を優先するため）
    existingItems.forEach(item => {
        seen.set(item.id, item);
    });

    // 新しくスクレイピングしたデータをマージ
    allItems.forEach(item => {
        const existing = seen.get(item.id);
        if (!existing) {
            seen.set(item.id, item);
        } else {
            // 既存がある場合、情報のマージを試みる
            // 落札ステータスへの変更
            if (item.status === '落札' && existing.status === '受付中') {
                existing.status = '落札';
            }
            // 落札業者の追記（既存にない場合のみ）
            if (item.winningContractor && !existing.winningContractor) {
                existing.winningContractor = item.winningContractor;
            }
            // biddingDateの補完
            if (item.biddingDate && !existing.biddingDate) {
                existing.biddingDate = item.biddingDate;
            }
        }
    });

    const unique = Array.from(seen.values());

    // 公告日の降順でソート
    unique.sort((a, b) => {
        const dateA = a.announcementDate ? new Date(a.announcementDate).getTime() : 0;
        const dateB = b.announcementDate ? new Date(b.announcementDate).getTime() : 0;
        return dateB - dateA;
    });

    console.log('\n=== 集計完了 ===');
    console.log(`新規取得: ${allItems.length} 件`);
    console.log(`合計: ${unique.length} 件 (既存含めマージ後)`);

    // 保存
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

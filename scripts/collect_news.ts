import fs from 'fs';
import { collectNews, mergeNewsItems } from '../src/services/news_service';
import { loadNewsStore, NEWS_STORE_FILE } from '../src/lib/news_store';

/**
 * 奈良の建築ニュースを全媒体から集めて news_items.json に貯める。
 * .github/workflows/news_collect.yml から定期実行する。
 */
async function main() {
    const store = loadNewsStore();
    const { items, sources } = await collectNews();

    for (const source of sources) {
        const state = source.error ? `取得エラー: ${source.error}` : 'OK';
        console.log(`[news] ${source.label}: 受信${source.fetched}件 → 採用${source.kept}件 (${state})`);
    }

    // 全媒体が0件なら通信側の問題なので、保存済みの記事と状態を書き換えない。
    // 1媒体の不調では失敗にしない。毎回赤くなると本物の失敗が埋もれる(2026-09の教訓)。
    if (sources.every(source => source.fetched === 0)) {
        console.error('[news] 全媒体から取得できませんでした');
        process.exit(1);
    }

    const merged = mergeNewsItems(store.items, items);
    const added = merged.filter(item => !store.items.some(existing => existing.link === item.link)).length;

    fs.writeFileSync(
        NEWS_STORE_FILE,
        `${JSON.stringify({ generatedAt: new Date().toISOString(), sources, items: merged }, null, 2)}\n`,
        'utf-8',
    );
    console.log(`[news] 保存 ${merged.length}件(今回の新規 ${added}件)`);
}

main().catch((error) => {
    console.error('[news] 失敗:', error);
    process.exit(1);
});

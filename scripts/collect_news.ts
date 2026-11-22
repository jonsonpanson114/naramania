import fs from 'fs';
import { collectNews, mergeNewsItems, type NewsItem } from '../src/services/news_service';
import { loadNewsStore, NEWS_STORE_FILE } from '../src/lib/news_store';
import { resolveWatchedFirms, type WatchedFirmsConfig } from '../src/lib/watched_firms';
import type { BiddingItem } from '../src/types/bidding';

/**
 * 奈良の建築ニュースを全媒体から集めて news_items.json に貯める。
 * .github/workflows/news_collect.yml から定期実行する。
 *
 * あわせて、奈良の設計事務所が大阪で仕事を取った記事を探す。新しく見つかったら
 * NEWS_ALERT_FILE に知らせる文を書き、workflow がそれで Issue を立てる(メールが届く)。
 */

function readJson<T>(path: string, fallback: T): T {
    try {
        return JSON.parse(fs.readFileSync(path, 'utf-8')) as T;
    } catch {
        return fallback;
    }
}

/** 奈良の公共の設計業務を取っている事務所。名簿は入札の収集データから毎回作り直す */
function loadWatchedFirms() {
    const items = readJson<BiddingItem[]>('scraper_result.json', []);
    const market = readJson<BiddingItem[] | { items?: BiddingItem[] }>('market_items.json', []);
    const marketItems = Array.isArray(market) ? market : market.items ?? [];
    const config = readJson<WatchedFirmsConfig>('config/watched_firms.json', {});
    return resolveWatchedFirms([...items, ...marketItems], config);
}

function alertBody(items: NewsItem[]): string {
    const lines = items.map(item =>
        `- **${(item.watchedFirms ?? []).join('、')}** — [${item.title}](${item.link})(${item.sourceLabel}、${item.date})`);
    return [
        '奈良の設計事務所が大阪の案件を取った記事が見つかりました。',
        '',
        ...lines,
        '',
        '名簿は奈良の公共の設計業務の落札者から自動で作っています。本社が奈良の外の事務所が混ざっていたら、`config/watched_firms.json` の exclude に足してください。',
    ].join('\n');
}

async function main() {
    const store = loadNewsStore();
    const watchedFirms = loadWatchedFirms();
    console.log(`[news] 見張る奈良の設計事務所 ${watchedFirms.length}社`);
    const { items, sources } = await collectNews(watchedFirms);

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
    const known = new Set(store.items.map(item => item.link));
    const added = merged.filter(item => !known.has(item.link));

    fs.writeFileSync(
        NEWS_STORE_FILE,
        `${JSON.stringify({ generatedAt: new Date().toISOString(), sources, items: merged }, null, 2)}\n`,
        'utf-8',
    );
    console.log(`[news] 保存 ${merged.length}件(今回の新規 ${added.length}件)`);

    const alerts = added.filter(item => item.watchedFirms?.length);
    console.log(`[news] 奈良の設計事務所が大阪で取った記事 ${alerts.length}件`);
    for (const item of alerts) console.log(`  ${item.watchedFirms?.join('、')}: ${item.title}`);
    if (alerts.length > 0 && process.env.NEWS_ALERT_FILE) {
        fs.writeFileSync(process.env.NEWS_ALERT_FILE, alertBody(alerts), 'utf-8');
    }
}

main().catch((error) => {
    console.error('[news] 失敗:', error);
    process.exit(1);
});

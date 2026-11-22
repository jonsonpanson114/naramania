import fs from 'fs';
import { mergeNewsItems, type NewsItem } from '../src/services/news_service';
import { loadNewsStore, NEWS_STORE_FILE } from '../src/lib/news_store';
import {
    collectOsakaPrefDesignResults,
    isNaraAddress,
    OSAKA_PREF_RESULTS_URL,
    type OsakaPrefResult,
} from '../src/services/osaka_pref_awards';

/**
 * 大阪府の入札結果から、奈良の事務所(落札者の住所が奈良)が取った建築設計・設備設計を探す。
 * 読んだ結果は osaka_awards.json に貯め、落札者まで決まった案件は開き直さない。
 * 見つけたものはニュースの「大阪で受注」に足し、NEWS_ALERT_FILE に知らせる文を書き足す。
 */

const STORE_FILE = 'osaka_awards.json';

interface Store {
    generatedAt: string | null;
    results: OsakaPrefResult[];
}

function loadStore(): Store {
    try {
        return JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8')) as Store;
    } catch {
        return { generatedAt: null, results: [] };
    }
}

function toNewsItem(result: OsakaPrefResult): NewsItem {
    return {
        id: `osaka-pref-${result.id}`,
        source: 'osaka-pref',
        sourceLabel: '大阪府 入札結果',
        title: `${result.winner}が落札／${result.title}／大阪府`,
        date: result.openDate,
        // 詳細は検索してからでないと開けないので、入札結果の入口に案件番号を添える
        link: `${OSAKA_PREF_RESULTS_URL}#${result.id}`,
        excerpt: [`場所: ${result.location}`, `落札者の住所: ${result.address}`, result.amount && `落札金額: ${result.amount}`]
            .filter(Boolean).join('　'),
        category: 'construction',
        orderer: '大阪府',
        results: [{ kind: '落札', contractor: result.winner ?? '', amount: result.amount }],
        watchedFirms: result.winner ? [result.winner] : undefined,
    };
}

async function main() {
    const store = loadStore();
    const before = new Map(store.results.map(result => [result.id, result]));
    const finished = new Set(store.results.filter(result => result.decided).map(result => result.id));

    const fetched = await collectOsakaPrefDesignResults({ finished });
    for (const result of fetched) before.set(result.id, result);
    const results = Array.from(before.values()).sort((a, b) => b.openDate.localeCompare(a.openDate));
    fs.writeFileSync(STORE_FILE, `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`, 'utf-8');

    const decided = fetched.filter(result => result.decided);
    const nara = decided.filter(result => isNaraAddress(result.address));
    console.log(`[osaka] 建築設計・設備設計の結果 ${fetched.length}件を読み、落札者決定 ${decided.length}件、うち奈良の事務所 ${nara.length}件`);
    for (const result of decided) console.log(`  ${result.openDate} ${result.winner}(${result.address}) ${result.title}`);
    if (nara.length === 0) return;

    const news = loadNewsStore();
    const merged = mergeNewsItems(news.items, nara.map(toNewsItem));
    fs.writeFileSync(
        NEWS_STORE_FILE,
        `${JSON.stringify({ ...news, items: merged }, null, 2)}\n`,
        'utf-8',
    );

    if (process.env.NEWS_ALERT_FILE) {
        const lines = nara.map(result =>
            `- **${result.winner}**(${result.address})— ${result.title}(大阪府、開札 ${result.openDate}${result.amount ? `、${result.amount}` : ''})`);
        const section = ['大阪府の入札結果で、奈良の事務所が落札した建築設計の案件が見つかりました。', '', ...lines].join('\n');
        const previous = fs.existsSync(process.env.NEWS_ALERT_FILE) ? fs.readFileSync(process.env.NEWS_ALERT_FILE, 'utf-8') : '';
        fs.writeFileSync(process.env.NEWS_ALERT_FILE, previous ? `${previous}\n\n${section}` : section, 'utf-8');
    }
}

main().catch((error) => {
    // 府のサイトの不調でニュースの保存まで止めない。失敗はログに残す
    console.error('[osaka] 大阪府の入札結果を読めませんでした:', error instanceof Error ? error.message : error);
    process.exit(1);
});

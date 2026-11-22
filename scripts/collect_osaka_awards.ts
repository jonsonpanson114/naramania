import fs from 'fs';
import { mergeNewsItems, type NewsItem } from '../src/services/news_service';
import { loadNewsStore, NEWS_STORE_FILE } from '../src/lib/news_store';
import { findWatchedFirms } from '../src/lib/watched_firms';
import { loadWatchedFirms } from '../src/lib/watched_firms_store';
import { toJstDateKey } from '../src/lib/jst_date';
import {
    collectOsakaPrefDesignResults,
    isNaraAddress,
    OSAKA_PREF_RESULTS_URL,
    type OsakaPrefResult,
} from '../src/services/osaka_pref_awards';
import { collectSakaiDesignResults, SAKAI_PPI_URL, type SakaiResult } from '../src/services/sakai_awards';
import { collectOsakaCityDesignResults, type OsakaCityResult } from '../src/services/osaka_city_awards';

/**
 * 大阪府・堺市・大阪市の入札結果から、奈良の事務所が取った建築設計・設備設計を探す。
 * - 大阪府: 落札者の住所が載るので、住所が奈良なら奈良の事務所とみなす
 * - 堺市・大阪市: 住所が載らないので、落札者の名前を奈良の設計事務所の名簿と照らす
 * 読んだ結果は osaka_awards.json に貯める。見つけたものはニュースの「大阪で受注」に足し、
 * NEWS_ALERT_FILE に知らせる文を書き足す(workflow がそれで Issue を立てる)。
 */

const STORE_FILE = 'osaka_awards.json';

interface Store {
    generatedAt: string | null;
    /** 大阪府 */
    results: OsakaPrefResult[];
    sakai?: SakaiResult[];
    osakaCity?: OsakaCityResult[];
}

interface Award {
    key: string;
    source: '大阪府' | '堺市' | '大阪市';
    winner: string;
    address?: string;
    title: string;
    openDate: string;
    amount?: string;
    link: string;
}

function loadStore(): Store {
    try {
        return JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8')) as Store;
    } catch {
        return { generatedAt: null, results: [] };
    }
}

function toNewsItem(award: Award): NewsItem {
    return {
        id: `osaka-award-${award.key}`,
        source: award.source === '大阪府' ? 'osaka-pref' : award.source === '堺市' ? 'sakai' : 'osaka-city',
        sourceLabel: `${award.source} 入札結果`,
        title: `${award.winner}が落札／${award.title}／${award.source}`,
        date: award.openDate,
        link: award.link,
        excerpt: [award.address && `落札者の住所: ${award.address}`, award.amount && `落札金額: ${award.amount}`]
            .filter(Boolean).join('　') || undefined,
        category: 'construction',
        orderer: award.source,
        results: [{ kind: '落札', contractor: award.winner, amount: award.amount }],
        watchedFirms: [award.winner],
    };
}

/** 大阪府: 落札者まで決まった案件は開き直さない */
async function prefAwards(store: Store): Promise<Award[]> {
    const before = new Map(store.results.map(result => [result.id, result]));
    const finished = new Set(store.results.filter(result => result.decided).map(result => result.id));
    const fetched = await collectOsakaPrefDesignResults({ finished });
    for (const result of fetched) before.set(result.id, result);
    store.results = Array.from(before.values()).sort((a, b) => b.openDate.localeCompare(a.openDate));

    const decided = fetched.filter(result => result.decided);
    const nara = decided.filter(result => isNaraAddress(result.address));
    console.log(`[osaka] 大阪府: 建築設計・設備設計の結果 ${fetched.length}件を読み、落札者決定 ${decided.length}件、うち奈良の事務所 ${nara.length}件`);
    return nara.map(result => ({
        key: `pref-${result.id}`,
        source: '大阪府',
        winner: result.winner ?? '',
        address: result.address,
        title: result.title,
        openDate: result.openDate,
        amount: result.amount,
        link: `${OSAKA_PREF_RESULTS_URL}#${result.id}`,
    }));
}

/** 堺市: 一覧に落札者が出るので毎回読み直し、前回から落札者が決まった案件だけを新しいものとする */
async function sakaiAwards(store: Store): Promise<Award[]> {
    const firms = loadWatchedFirms();
    const known = new Map((store.sakai ?? []).map(result => [result.id, result]));
    const fetched = await collectSakaiDesignResults();
    const newlyDecided = fetched.filter(result => result.winner && known.get(result.id)?.winner !== result.winner);
    const nara = newlyDecided.filter(result => findWatchedFirms(result.winner ?? '', firms).length > 0);
    for (const result of fetched) known.set(result.id, result);
    store.sakai = Array.from(known.values()).sort((a, b) => b.openDate.localeCompare(a.openDate));

    console.log(`[osaka] 堺市: 建築設計・設備設計の結果 ${fetched.length}件(新しく落札者が決まった ${newlyDecided.length}件)、うち奈良の事務所 ${nara.length}件 / 名簿 ${firms.length}社`);
    return nara.map(result => ({
        key: `sakai-${result.id}`,
        source: '堺市',
        winner: result.winner ?? '',
        title: result.title,
        openDate: result.openDate || toJstDateKey(new Date()),
        amount: result.amount && `${result.amount}円`,
        link: `${SAKAI_PPI_URL}#${result.id}`,
    }));
}

/** 大阪市: 一覧は落札者が決まった案件だけ。前回から増えた案件を新しいものとする */
async function osakaCityAwards(store: Store): Promise<Award[]> {
    const firms = loadWatchedFirms();
    const known = new Map((store.osakaCity ?? []).map(result => [result.id, result]));
    const fetched = await collectOsakaCityDesignResults();
    const newlyDecided = fetched.filter(result => result.winner && known.get(result.id)?.winner !== result.winner);
    const nara = newlyDecided.filter(result => findWatchedFirms(result.winner ?? '', firms).length > 0);
    for (const result of fetched) known.set(result.id, result);
    store.osakaCity = Array.from(known.values()).sort((a, b) => b.openDate.localeCompare(a.openDate));

    console.log(`[osaka] 大阪市: 建築設計・設備設計の結果 ${fetched.length}件(新しく落札者が決まった ${newlyDecided.length}件)、うち奈良の事務所 ${nara.length}件`);
    return nara.map(result => ({
        key: `city-${result.id}`,
        source: '大阪市',
        winner: result.winner ?? '',
        title: result.title,
        openDate: result.openDate || toJstDateKey(new Date()),
        amount: result.amount,
        link: `https://www.osaka.city.beneproc.com/#/anken-list/supplier-decided?keyword=${encodeURIComponent(result.id)}`,
    }));
}

async function main() {
    const store = loadStore();
    const awards: Award[] = [];
    const failures: string[] = [];

    // 片方のサイトの不調で、もう片方まで止めない
    const sources = [['大阪府', prefAwards], ['堺市', sakaiAwards], ['大阪市', osakaCityAwards]] as const;
    for (const [name, run] of sources) {
        try {
            awards.push(...await run(store));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failures.push(`${name}: ${message}`);
            console.error(`::warning::[osaka] ${name}の入札結果を読めませんでした: ${message}`);
        }
    }

    fs.writeFileSync(STORE_FILE, `${JSON.stringify({ ...store, generatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf-8');
    for (const award of awards) console.log(`  ${award.source} ${award.openDate} ${award.winner}: ${award.title}`);

    if (awards.length > 0) {
        const news = loadNewsStore();
        const merged = mergeNewsItems(news.items, awards.map(toNewsItem));
        fs.writeFileSync(NEWS_STORE_FILE, `${JSON.stringify({ ...news, items: merged }, null, 2)}\n`, 'utf-8');

        if (process.env.NEWS_ALERT_FILE) {
            const lines = awards.map(award =>
                `- **${award.winner}**${award.address ? `(${award.address})` : ''} — ${award.title}(${award.source}、開札 ${award.openDate}${award.amount ? `、${award.amount}` : ''})`);
            const section = ['大阪府内の入札結果で、奈良の事務所が落札した建築設計の案件が見つかりました。', '', ...lines].join('\n');
            const previous = fs.existsSync(process.env.NEWS_ALERT_FILE) ? fs.readFileSync(process.env.NEWS_ALERT_FILE, 'utf-8') : '';
            fs.writeFileSync(process.env.NEWS_ALERT_FILE, previous ? `${previous}\n\n${section}` : section, 'utf-8');
        }
    }

    if (failures.length === sources.length) process.exit(1);
}

main().catch((error) => {
    console.error('[osaka] 失敗:', error instanceof Error ? error.message : error);
    process.exit(1);
});

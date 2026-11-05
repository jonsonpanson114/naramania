import fs from 'fs';
import path from 'path';
import type { Frame, Page } from 'playwright';
import type { BiddingItem, ProjectBriefRecord } from '../../types/bidding';
import { sanitizeProjectBrief } from './project_brief';

/**
 * 電子入札システム(EPI・efftis・県PPI)の案件詳細ページから中身を読む。
 *
 * どのシステムも項目名と値の表なので、AIを通さずそのまま読める。
 * 発注図書や公告PDFはパスワードの入力が必要なので、公開されている詳細ページだけを読む。
 * efftis と EPI は検索したセッションの中でしか詳細を開けないため、
 * 収集の処理の中から呼ぶ。
 */

/** 1回の検索で開く詳細ページの上限。読み終えた案件は開かないので、数日で全件に届く */
export const SYSTEM_DETAIL_LIMIT = 12;

export type DetailPair = [label: string, value: string];
export type DetailTarget = { item: BiddingItem; url: string };

const NOISE_VALUE = /^(?:[-*ー－]+|入札公告文のとおり|電子契約が可能な案件です。?|開札後に公表|公表しない|設定なし|制限なし|指定しない|未定)$/;
const TITLE_LABELS = ['件名', '工事名', '業務名'];

function normalizeLabel(label: string): string {
    return label.normalize('NFKC').replace(/\s+/g, '');
}

function normalizeValue(value: string): string {
    return value
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .replace(/(令和|年|月) (?=\d)/g, '$1')
        .trim();
}

/** 項目名と値の組から案件の中身を作る。詳細ページでなければ null を返す */
export function briefFromDetailPairs(title: string, pairs: DetailPair[], checkedAt: string): ProjectBriefRecord | null {
    const values = new Map<string, string>();
    for (const [label, value] of pairs) {
        const key = normalizeLabel(label);
        const text = normalizeValue(value);
        if (key && text && !values.has(key)) values.set(key, text);
    }
    // セッションが切れると「タイムアウト」の画面が返る。読めなかった案件を読了扱いにしない
    if (!TITLE_LABELS.some(label => values.has(label))) return null;

    const pick = (...labels: string[]) => {
        for (const label of labels) {
            const value = values.get(label);
            if (value && !NOISE_VALUE.test(value)) return value;
        }
        return undefined;
    };

    const taxExcluded = pick('予定価格(消費税を除く)', '予定価格(税抜)');
    const qualification = [
        pick('入札方式'),
        pick('業種', '業種1', '求める業種1'),
        pick('等級1', '求める格付1'),
        pick('所在地区分', '条件1'),
        pick('条件2'),
    ].filter(Boolean).join(' / ').slice(0, 280);

    return sanitizeProjectBrief(title, {
        found: true,
        summary: pick('工事内容', '業務内容', '工事概要', '業務概要', '概要'),
        location: pick('工事場所', '業務場所', '履行場所', '施工場所'),
        period: pick('工期', '履行期間', '履行期限'),
        price: taxExcluded ? `${taxExcluded}(税抜)` : pick('予定価格'),
        qualification,
    }, checkedAt);
}

/**
 * 画面の表から、隣り合う欄を項目名と値の組として取り出す。
 * 関数のまま渡すと tsx の変換で __name が差し込まれ、ブラウザ側で
 * ReferenceError になる(全件読めなくなる)ので、文字列で渡す。
 */
const READ_PAIRS_SCRIPT = `(() => {
    const text = (element) => ((element && element.innerText) || '').trim();
    const pairs = [];
    // 県PPIは表ではなく div で並んでいる
    document.querySelectorAll('.item').forEach((item) => {
        pairs.push([text(item.querySelector('.item_title')), text(item.querySelector('.item_description'))]);
    });
    document.querySelectorAll('tr').forEach((row) => {
        const cells = Array.from(row.children);
        for (let i = 0; i + 1 < cells.length; i += 1) pairs.push([text(cells[i]), text(cells[i + 1])]);
    });
    return pairs;
})()`;

async function readDetailPairs(surface: Page | Frame): Promise<DetailPair[]> {
    return surface.evaluate<DetailPair[]>(READ_PAIRS_SCRIPT);
}

/** 掲載データで中身を読み終えた案件。毎回開き直して相手のサーバーに負担をかけない */
export function loadBriefedIds(): Set<string> {
    try {
        const items: BiddingItem[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scraper_result.json'), 'utf-8'));
        return new Set(items.filter(item => item.brief).map(item => item.id));
    } catch {
        return new Set();
    }
}

/** 一覧の検索画面に対応する efftis の詳細画面 */
const EFFTIS_DETAIL_SCREENS: Record<string, string> = {
    PPUBC00400: 'PPUBC00500',
    PPUBC00700: 'PPUBC00800',
};

/** efftis の件名リンクの onclick="link('0201', '2026', '0000002706')" から詳細のURLを作る */
export function efftisDetailUrl(base: string, screenId: string, onclick?: string | null): string | undefined {
    const args = onclick?.match(/link\('(\w+)',\s*'(\w+)',\s*'(\w+)'\)/);
    const screen = EFFTIS_DETAIL_SCREENS[screenId];
    if (!args || !screen) return undefined;
    return `${base}/${screen}!kenmeiLink?organizationNumber=${args[1]}&nendo=${args[2]}&keiyakuNo=${args[3]}`;
}

/** 新しい案件から詳細を開き、読めたものを item.brief に入れる。失敗しても収集は止めない */
export async function readSystemBriefs(
    surface: Page | Frame,
    targets: DetailTarget[],
    options: { briefedIds: Set<string>; limit?: number; deadline?: number },
): Promise<number> {
    const pending = targets
        .filter(({ item }) => !options.briefedIds.has(item.id))
        .sort((a, b) => (b.item.announcementDate || '').localeCompare(a.item.announcementDate || ''))
        .slice(0, options.limit ?? SYSTEM_DETAIL_LIMIT);
    let read = 0;

    for (const { item, url } of pending) {
        if (options.deadline && Date.now() > options.deadline) break;
        try {
            await surface.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await surface.waitForTimeout(800);
            const brief = briefFromDetailPairs(item.title, await readDetailPairs(surface), new Date().toISOString());
            if (brief) {
                item.brief = brief;
                read += 1;
            }
        } catch (error) {
            console.warn(`[案件詳細] ${item.id}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
        }
    }

    if (pending.length > 0) console.log(`[案件詳細] ${pending[0].item.municipality}: ${read} / ${pending.length}件を読み取りました`);
    return read;
}

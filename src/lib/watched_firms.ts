import type { BiddingItem } from '@/types/bidding';

/**
 * 奈良の公共の設計業務を取っている建築設計事務所を、他府県の記事から見つけるための名簿。
 *
 * 落札結果には所在地が載らないので、奈良の案件を実際に取っている事務所を「奈良の事務所」とみなす。
 * 土木系の建設コンサルタントは建材の営業先ではないので除く。
 */

export interface WatchedFirm {
    /** 落札結果に載っていた表記 */
    name: string;
    /** 照合に使う、法人格や記号を外した名前 */
    key: string;
}

const LEGAL_FORMS = /株式会社|有限会社|合同会社|一般社団法人|\(株\)|\(有\)|\(同\)|㈱|㈲|一級建築士事務所/g;
const ARCHITECT_NAME = /設計|建築|アーキテクツ|アトリエ|事務所|研究所|工房|デザイン/;
/** 設計の案件でない欄から拾うときは、施工会社(○○建築)と分けるため設計事務所らしい名前に限る */
const DESIGN_OFFICE_NAME = /設計|事務所|アーキテクツ|アトリエ|デザイン|工房/;
/** 土木系の建設コンサルタントや施工・設備の会社。建材の営業先ではない */
const NOT_ARCHITECT = /建設コンサルタン|技術|測量|測地|調査|地質|土木|水工|エンジニ|工業|建設(?!設計)|電気|設備|管工|造園|舗装|生物|^(?!.*設計).*コンサルタン/;
/** 入札者の一覧が欄にそのまま入っていることがあるので、名前でない語を除く */
const NOISE_TOKEN = /辞退|入札|氏名|落札|予定|金額|不調|無効|失格|開札|結果|円|業者|価格|回目/;
/** 「○○設計 奈良営業所」のような支店名。本社が奈良の外にある事務所なので名簿から外す */
const BRANCH = /(\S+)\s+\S{0,6}(?:営業所|支店|支社|出張所|事務所)(?=\s|$)/g;
const BRANCH_WORD = /(.+?)(?:(?:奈良|関西|大阪|京都)?(?:営業所|支店|支社|出張所)|(?:奈良|関西|大阪|京都)事務所)$/;
/** 普通の言葉としても記事に出てくるので、名前だけでは判定に使わない */
const GENERIC_KEYS = new Set(['空間設計', '建築設計', '設計事務所', '建築事務所', '総合設計', '建築設計事務所', '設計監理', '建築研究所']);

export function firmKey(name: string): string {
    return name
        .normalize('NFKC')
        .replace(LEGAL_FORMS, '')
        .replace(/[\s・,.、。()（）「」]/g, '');
}

/** 設計の仕事か。工事の落札者は施工会社なので名簿に入れない */
function isDesignWork(item: BiddingItem): boolean {
    return item.type === 'コンサル' || item.type === '委託' || /設計|監理/.test(item.title);
}

/**
 * 欄から事務所名を取り出す。共同体の名前や入札者の一覧が1つの欄に入っていることがあるので、
 * 区切って事務所名らしいものを全部拾う。支店名の付いたものは本社が外として outside に入れる。
 */
export function extractFirmNames(field: string, outside: Set<string>, designOfficeOnly = false): string[] {
    // 「株式会社 礎建築事務所」の空白だけ詰める。「協和設計株式会社 奈良営業所」は支店名として残す
    let text = field.normalize('NFKC').replace(/(^|\s)(株式会社|有限会社|合同会社)\s+/g, '$1$2');
    if (/共同体|JV/.test(text)) text = text.replace(/・/g, ' ');
    text = text.replace(BRANCH, (whole, base: string) => {
        if (ARCHITECT_NAME.test(base) && !NOISE_TOKEN.test(base)) outside.add(firmKey(base));
        return ' ';
    });

    const names: string[] = [];
    for (const raw of text.split(/[\s、,/／]+|共同体|JV/)) {
        const token = raw.trim();
        if (!token || NOISE_TOKEN.test(token)) continue;
        const branch = token.match(BRANCH_WORD);
        if (branch) {
            outside.add(firmKey(branch[1]));
            continue;
        }
        if (!(designOfficeOnly ? DESIGN_OFFICE_NAME : ARCHITECT_NAME).test(token)) continue;
        if (NOT_ARCHITECT.test(token)) continue;
        names.push(token);
    }
    return names;
}

export function buildWatchedFirms(items: BiddingItem[], exclude: string[] = []): WatchedFirm[] {
    const firms = new Map<string, WatchedFirm>();
    const outside = new Set(exclude.map(firmKey));

    for (const item of items) {
        const design = isDesignWork(item);
        const fields: Array<[string | undefined, boolean]> = [
            [item.designFirm, false],
            [item.winningContractor, !design],
        ];
        for (const [field, designOfficeOnly] of fields) {
            if (!field) continue;
            for (const name of extractFirmNames(field, outside, designOfficeOnly)) {
                const key = firmKey(name);
                if (key.length < 4 || key.length > 25 || GENERIC_KEYS.has(key) || firms.has(key)) continue;
                firms.set(key, { name, key });
            }
        }
    }

    return Array.from(firms.values())
        .filter(firm => !outside.has(firm.key))
        .sort((a, b) => a.key.localeCompare(b.key, 'ja'));
}

/** 記事の文に出てくる名簿の事務所 */
export function findWatchedFirms(text: string, firms: WatchedFirm[]): WatchedFirm[] {
    const normalized = firmKey(text);
    return firms.filter(firm => normalized.includes(firm.key));
}

/** 公告や計画ではなく、事務所が仕事を取ったことを伝える記事か */
export const AWARD_WORDS = /落札|特定|選定|決まる|決定|受注|契約|最優秀|優先交渉|委託先|に決め/;

const OSAKA_PLACES = [
    '大阪', '堺市', '豊中市', '吹田市', '高槻市', '枚方市', '茨木市', '八尾市', '寝屋川市', '岸和田市',
    '和泉市', '守口市', '箕面市', '門真市', '松原市', '大東市', '羽曳野市', '摂津市', '高石市', '藤井寺市',
    '泉大津市', '泉佐野市', '富田林市', '河内長野市', '池田市', '貝塚市', '柏原市', '交野市', '泉南市',
    '阪南市', '四條畷市', '島本町', '豊能町', '能勢町', '忠岡町', '熊取町', '田尻町', '岬町', '太子町',
    '河南町', '千早赤阪村',
];
const OSAKA_PATTERN = new RegExp(OSAKA_PLACES.join('|'));

export function isOsakaRelated(text: string): boolean {
    return OSAKA_PATTERN.test(text);
}

/**
 * 名簿の事務所が大阪で仕事を取った記事なら、その事務所名を返す。
 * 事務所名・受注の言葉・大阪の地名がそろったときだけ拾う。公告や計画の記事は拾わない。
 */
export function osakaAwardFirms(
    title: string,
    body: string,
    firms: WatchedFirm[],
    fromOsakaFeed = false,
): string[] {
    const head = `${title} ${body.slice(0, 300)}`;
    if (!AWARD_WORDS.test(head)) return [];
    if (!fromOsakaFeed && !isOsakaRelated(head)) return [];
    return findWatchedFirms(`${title} ${body}`, firms).map(firm => firm.name);
}

export interface WatchedFirmsConfig {
    exclude?: string[];
    include?: string[];
}

/** 自動の名簿に、手で足した事務所を加える */
export function resolveWatchedFirms(items: BiddingItem[], config: WatchedFirmsConfig = {}): WatchedFirm[] {
    const firms = buildWatchedFirms(items, config.exclude ?? []);
    for (const name of config.include ?? []) {
        const key = firmKey(name);
        if (key && !firms.some(firm => firm.key === key)) firms.push({ name, key });
    }
    return firms;
}

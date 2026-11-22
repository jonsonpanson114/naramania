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
const ARCHITECT_NAME = /設計|建築|アーキテクツ|アトリエ|事務所|研究所/;
const NOT_ARCHITECT = /コンサルタン|技術|測量|調査|地質|土木|工業|建設(?!設計)/;
/** 「○○設計 奈良営業所」のような支店名。本社が奈良の外にある事務所なので名簿から外す */
const BRANCH_SUFFIX = /\s+\S*(?:営業所|支店|支社|出張所|事務所)$/;
/** 共同体は構成員それぞれが単独でも出てくるので、まとめた名前では照合しない */
const JOINT_VENTURE = /共同体|JV|、/;
/** 普通の言葉としても記事に出てくるので、名前だけでは判定に使わない */
const GENERIC_KEYS = new Set(['空間設計', '建築設計', '設計事務所', '建築事務所', '総合設計']);

export function firmKey(name: string): string {
    return name
        .normalize('NFKC')
        .replace(LEGAL_FORMS, '')
        .replace(/[\s・,.、。()（）「」]/g, '');
}

export function buildWatchedFirms(items: BiddingItem[], exclude: string[] = []): WatchedFirm[] {
    const firms = new Map<string, WatchedFirm>();
    const outside = new Set(exclude.map(firmKey));

    for (const item of items) {
        const names = [item.designFirm, item.winnerType === '設計事務所' ? item.winningContractor : undefined];
        for (const raw of names) {
            const name = raw?.normalize('NFKC').trim();
            if (!name || JOINT_VENTURE.test(name) || !ARCHITECT_NAME.test(name) || NOT_ARCHITECT.test(name)) continue;
            if (BRANCH_SUFFIX.test(name)) {
                outside.add(firmKey(name.replace(BRANCH_SUFFIX, '')));
                continue;
            }
            const key = firmKey(name);
            if (key.length < 4 || GENERIC_KEYS.has(key) || firms.has(key)) continue;
            firms.set(key, { name: raw!.trim(), key });
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

export type SalesFitLevel = 'toilet' | 'interior' | 'facility' | 'general';

export interface SalesFitResult {
    level: SalesFitLevel;
    label: string;
    shortLabel: string;
    isTarget: boolean;
    badgeClass: string;
}

const TOILET_PARTITION_RE = /トイレ|便所|間仕切|パーテーション|パーティション|ブース|建具|ドア|扉|内装改修|内装工事/;
const STRONG_BUILDING_RE = /新築|増築|改築|建て替え|建替|移転|複合施設|スキルスラボ|教育研修棟|校舎|庁舎|公民館|図書館|こども園|保育園|幼稚園|児童館|福祉センター|文化会館|病院|診療所|長寿命化/;
const FACILITY_EXTERIOR_RE = /空調|エアコン|電気設備|受変電|キュービクル|照明|給排水|衛生設備|エレベーター|昇降機|消防|自動火災|放送設備|通信|屋上防水|防水改修|外壁改修|外壁塗装|舗装|外構|法面|解体|除却|撤去|測量|地質|橋梁|道路|下水道|ポンプ場|太陽光|蓄電池/;
const GENERAL_RENOVATION_RE = /改修|模様替|リノベ|整備|リニューアル|団地|市営住宅|府営住宅|体育館|屋内運動場/;

/**
 * 案件名・概要から、内装建具・トイレブース等の建材営業における狙い目度を判定する。
 */
export function evaluateSalesFit(title: string, description?: string): SalesFitResult {
    const text = `${title} ${description ?? ''}`.normalize('NFKC');

    if (TOILET_PARTITION_RE.test(text)) {
        return {
            level: 'toilet',
            label: 'トイレ・間仕切り',
            shortLabel: 'トイレ・建具',
            isTarget: true,
            badgeClass: 'border-rose-200 bg-rose-50 text-rose-800',
        };
    }

    const hasStrongBuilding = STRONG_BUILDING_RE.test(text);
    const hasFacilityOnly = FACILITY_EXTERIOR_RE.test(text);

    if (hasStrongBuilding && !hasFacilityOnly) {
        return {
            level: 'interior',
            label: '建築・内装狙い目',
            shortLabel: '内装狙い目',
            isTarget: true,
            badgeClass: 'border-amber-300 bg-amber-50 text-amber-900',
        };
    }

    if (hasFacilityOnly) {
        // 例: 「体育館空調設備改修」などは設備メインとして区別する
        return {
            level: 'facility',
            label: '設備・外構メイン',
            shortLabel: '設備・外構',
            isTarget: false,
            badgeClass: 'border-stone-200 bg-stone-100 text-stone-600',
        };
    }

    if (hasStrongBuilding || GENERAL_RENOVATION_RE.test(text)) {
        return {
            level: 'interior',
            label: '建築・内装狙い目',
            shortLabel: '内装狙い目',
            isTarget: true,
            badgeClass: 'border-amber-300 bg-amber-50 text-amber-900',
        };
    }

    return {
        level: 'general',
        label: '一般案件',
        shortLabel: '一般',
        isTarget: false,
        badgeClass: 'border-stone-200 bg-white text-stone-600',
    };
}

export interface DesignTimingEstimate {
    /** 仕様提案しやすい時期のラベル（例: "2026年12月〜2027年2月"） */
    proposalWindow: string;
    /** 本体工事の目安時期ラベル */
    constructionWindow?: string;
    /** 段階の短い説明 */
    stageNote: string;
    /** 現在がちょうど仕様提案の適期かどうか */
    isNowHot: boolean;
}

function addMonths(base: Date, months: number): Date {
    const d = new Date(base.getTime());
    d.setMonth(d.getMonth() + months);
    return d;
}

function formatYearMonth(d: Date): string {
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

/**
 * 設計業務の開札日・公告日から「仕様提案しやすい時期」と「本体工事の目安」を算出する。
 */
export function estimateDesignTiming(
    title: string,
    dateStr?: string,
    type?: string,
    now: Date = new Date(),
): DesignTimingEstimate | null {
    const normalized = title.normalize('NFKC');
    const isDesign = type === 'コンサル' || type === '委託' || /設計|監理/.test(normalized);
    if (!isDesign || !dateStr) return null;

    const match = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!match) return null;
    const base = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (Number.isNaN(base.getTime())) return null;

    const isSupervisionOnly = /監理/.test(normalized) && !/設計/.test(normalized);
    if (isSupervisionOnly) {
        return {
            proposalWindow: `${formatYearMonth(base)}〜`,
            stageNote: '監理フェーズ（施工・仕様確認期）',
            isNowHot: false,
        };
    }

    const isBasicDesign = /基本設計/.test(normalized);
    const startOffset = isBasicDesign ? 1 : 0;
    const endOffset = isBasicDesign ? 4 : 3;
    const constructionStart = isBasicDesign ? 6 : 4;
    const constructionEnd = isBasicDesign ? 12 : 9;

    const propStart = addMonths(base, startOffset);
    const propEnd = addMonths(base, endOffset);
    const constStart = addMonths(base, constructionStart);
    const constEnd = addMonths(base, constructionEnd);

    const isNowHot = now.getTime() >= base.getTime() && now.getTime() <= propEnd.getTime();

    return {
        proposalWindow: `${formatYearMonth(propStart)}〜${formatYearMonth(propEnd)}`,
        constructionWindow: `${formatYearMonth(constStart)}〜${formatYearMonth(constEnd)}頃`,
        stageNote: isBasicDesign ? '基本設計 → 仕様提案どき' : '実施設計 → 図面・仕様確定前',
        isNowHot,
    };
}

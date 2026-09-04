import type { BiddingItem } from '../../types/bidding';
import dataFilters from '../../../config/data_filters.json';

/**
 * 建築・建物系案件だけを残すための共通フィルタ
 */

// RSS全体スクレイピング時に「本当に入札案件か」を確認するポジティブキーワード
const BIDDING_POSITIVE_KEYWORDS = [
    '入札', '公告', '落札', '工事', '設計',
    '業務委託', '委託', '請負', '建設', '修繕', '改修', '新築', '解体', '契約',
];

/**
 * RSS全体スクレイピング時に使用するポジティブフィルタ。
 * 入札・工事関連キーワードを含む かつ タイトルが十分な長さ → true
 * マラソン大会・職員採用・広報誌などのノイズを排除する。
 */
export function isRealBiddingItem(title: string): boolean {
    if (title.length < 6) return false;
    return BIDDING_POSITIVE_KEYWORDS.some(kw => title.includes(kw));
}

export const EXCLUSION_KEYWORDS = [
    // --- 土木・道路・インフラ系 (建築以外) ---
    '道路', '橋梁', '河川', '砂防', '舗装', '法面', 'ダム', '護岸', '浚渫',
    '排水路', '側溝', '水路', '堤防', 'トンネル', 'ガードレール',
    '標識', '街灯', '除草', '清掃', '下水道', '上水道',
    '橋', '土木', '砂利', 'アスファルト', '信号機', '街路樹', '擁壁',
    '防護柵', '区画線', '路面清掃', '除雪', '融雪', '消雪',
    '土砂', '落石', '汚泥', '交通',
    '除草', '除雪', '融雪', '消雪', '清掃', '路面清掃',

    // --- 測量・地質・環境調査系 ---
    '測量', '地質', '用地', '補償', '境界', '物件調査',
    '交通量', '騒音', '振動', '環境調査', 'アセスメント',
    '土地評価', '土壌汚染', '家屋調査', '流量観測', '観測',

    // --- 物品・備品・消耗品・リース系 ---
    '備品', '消耗品', '購入', 'リース', '賃貸借', '物品', 
    '事務用品', '文房具', '用紙', 'トナー', 'インク', '封筒', '印章', '印刷', '製本',
    '家具', '机', '椅子', 'ロッカー', '棚', 'キャビネット',
    '被服', '制服', '作業服', '寝具', 'タオル', 'テント',
    '燃料', 'ガソリン', '軽油', '灯油', '重油', 'プロパンガス', '高圧ガス', '薬剤',
    '医薬品', '試薬', '医療用品', '介護用品', '工業薬品', '厨房機器',
    '除細動器', 'AED', 'ワクチン', '健診', '検針', '健康診断',
    'ＯＡ機器', 'パソコン', 'ＰＣ', 'サーバー', '周辺機器', 'プリンタ', 'コピー機',
    'ソフトウェア', 'ライセンス', 'Microsoft', '導入', '運用', '保守契約', '通信機器', '無線機',
    '看板', '掲示板', '案内板', '車両', '特装車', '乗用車', '搬送', '配送', '運搬', '集荷',
    '自動車', '自転車', 'タイヤ', '部品購入', '楽器', '体育用品',
    '消防用品', '防災用品', '非常食', '記念品', '贈答品', '日用品',
    '自動販売機', 'バス', 'タクシー', '送迎',

    // --- その他一般ノイズ・役務 (建築・設計以外) ---
    'マラソン', '採用', '広報', '官報', '給食', '警備', '受付', 
    '補助金', '助成金', 'セミナー', '研修', '講座', 'イベント', '放送',
    'システム開発', 'ポータルサイト', '会議録', '粗原稿', '議会', '一般質問', '一般質疑',
    '売却', '資源', '維持管理', '調査', '墓地', '葬祭', 'ごみ', '廃棄物',
    '徴収', '案内', 'ガイド', 'サイトマップ', 'カレンダー', '地図でさがす',
    '開札日時', '入札方法', '評価対象工事', '資格審査', '申請ガイド',
    '明細書', '診療報酬', 'IT', 'ICT', '調達', '国道', '定期点検', '保守', '管理委託', '警備委託', '受付委託',
    '技術', 'LED', '変電'
];

const DEFAULT_ALWAYS_EXCLUDE_KEYWORDS = [
    'TikTok', 'PR動画', '動画制作', '広報', '印刷', '封入', '封緘', '帳票',
    '給食', '検便', '診療報酬', '税', 'データパンチ', '賃貸借',
    '送迎', 'バス運行', '警備', '受付案内', '葬祭', '墓地',
    '健康増進', '食育', '介護保険', '福祉計画', '障害福祉',
    '教育大綱', '地域防災計画', '防災マップ', '部活動',
    '発掘調査', '埋蔵文化財', '地籍調査', '登記', '除草',
    'システム', 'ソフトウェア', 'ライセンス', 'デジタルサイネージ',
    '音響設備機材', '固定資産税', '住民税', '国民健康保険',
    '建設工事がすすんでいます', '利用できなくなります', '引越し作業',
    '指定管理', '指定管理者', '施設管理', '駐車場',
    '外壁', '外壁改修', '外壁等', '外装',
    '防水', '屋上防水', '防水工事', '防水改修',
    'LED', '照明', '空調', 'エアコン', '設備', '設備更新',
    '受変電設備', '受電設備', '高圧受電設備', '高圧機器',
    '消防用設備', '防火設備', '建築設備', '給水設備',
    '温水設備', '換気設備', '発電設備', '自動火災報知設備',
    '排煙ファン', '排煙設備', '貯水槽', '耐震性貯水槽',
    'ボイラー', '冷温水機', '消火栓設備', 'ポンプ更新',
    'エレベーター', '昇降機', '電気棟',
    '受水槽', '下水接続', '汚水配管', '配管改修', '給排水',
];

const DEFAULT_INFRA_EXCLUDE_KEYWORDS = [
    '道路', '橋梁', '河川', '砂防', '舗装', '法面', '護岸', '浚渫',
    '排水路', '側溝', '水路', '堤防', 'トンネル', 'ガードレール',
    '標識', '区画線', '配水管', '布設', '水道', '下水道',
    '農道', '林道', '池改修', 'ため池', '配水場', '配水池', '交通安全施設',
    '浄水場', '井戸',
];

const DEFAULT_ARCHITECTURE_CONTEXT_KEYWORDS = [
    '建築', '建物', '庁舎', '校舎', '学校', '小学校', '中学校', '高校',
    '小中学校', '屋内運動場',
    '幼稚園', 'こども園', '保育園', '保育所', '認定こども園',
    '公民館', '会館', '交流館', 'センター', '体育館', '図書館', '消防署',
    '消防団', '消防車庫', '分団庫', '憩いの家',
    '保健所', '病院', '診療所', '役場',
    '交番', '住宅', '市営住宅', '団地', '施設', 'ホール',
    'ハウス', 'はうす',
    'トイレ', '便所', '屋根', '内装', '防火戸', '耐震', '仮眠室',
    '書庫',
];

const DEFAULT_ARCHITECTURE_WORK_KEYWORDS = [
    '工事', '修繕', '改修', '新築', '増築', '設計', '実施設計',
    '基本設計', '基本計画', '工事監理', '耐震診断', '発注支援',
];

// 際どい救済トリガー専用のサブセット。ARCHITECTURE_CONTEXT_KEYWORDS全体を条件にすると
// 「公民館外壁改修工事」「体育館空調設備更新工事」のような、まさにこのフィルタが
// 除外すべき単体設備更新工事まで「施設種別語+作業語」だけで丸ごと救済してしまう。
// 施設種別語(学校・こども園等)に加えて、トイレ改修のような具体的な建築要素語が
// タイトルに明記されている場合だけを「複合的な建築工事」とみなして救済する。
const FACILITY_TYPE_KEYWORDS = [
    '建築', '建物', '庁舎', '校舎', '学校', '小学校', '中学校', '高校',
    '小中学校', '屋内運動場',
    '幼稚園', 'こども園', '保育園', '保育所', '認定こども園',
    '公民館', '会館', '交流館', 'センター', '体育館', '図書館', '消防署',
    '消防団', '消防車庫', '分団庫', '憩いの家',
    '保健所', '病院', '診療所', '役場',
    '交番', '住宅', '市営住宅', '団地', '施設', 'ホール',
    'ハウス', 'はうす',
];
const SPECIFIC_ELEMENT_KEYWORDS = ['トイレ', '便所', '屋根', '内装', '防火戸', '仮眠室', '書庫'];

const ALWAYS_EXCLUDE_KEYWORDS = [...new Set([...DEFAULT_ALWAYS_EXCLUDE_KEYWORDS, ...dataFilters.alwaysExcludeKeywords])];
const INFRA_EXCLUDE_KEYWORDS = [...new Set([...DEFAULT_INFRA_EXCLUDE_KEYWORDS, ...dataFilters.infraExcludeKeywords])];
const ARCHITECTURE_CONTEXT_KEYWORDS = [...new Set([...DEFAULT_ARCHITECTURE_CONTEXT_KEYWORDS, ...dataFilters.architectureContextKeywords])];
const ARCHITECTURE_WORK_KEYWORDS = [...new Set([...DEFAULT_ARCHITECTURE_WORK_KEYWORDS, ...dataFilters.architectureWorkKeywords])];
const INFRA_ALLOWED_KEYWORDS = dataFilters.infraAllowedKeywords;

// インフラ語は部分一致で照合するため、地名や施設名の一部に同じ字面が含まれると
// 建築案件まで土木案件として落ちる。
// 実例: 天理市「井戸堂小学校プール集約化に伴う改修工事」が地名『井戸堂』の
// 『井戸』に一致して除外され、学校の改修工事が丸ごと消えていた。
// 収集済みデータ上、キーワード『井戸』の一致はすべてこの誤検知で、正当な一致は0件だった。
// インフラ判定の直前にこれらの並びを空白へ置換してから照合する。
// 削除ではなく空白にするのは、前後の文字が連結して別のキーワード
// (例:「下井戸堂水道」→「下水道」)に化けるのを防ぐため。
const INFRA_PLACE_NAME_EXCEPTIONS = [
    '井戸堂', // 天理市の地名。『井戸』に一致する
];

function maskInfraPlaceNames(text: string): string {
    return INFRA_PLACE_NAME_EXCEPTIONS.reduce(
        (masked, placeName) => masked.split(placeName).join(' '),
        text,
    );
}
const PRIORITY_ARCHITECTURE_PATTERNS = [
    '芝運動公園運動場等再整備基本設計業務',
    '立地適正化計画改定業務',
    '給食室改修工事',
    '山添村義務教育学校建設基本計画業務',
    '斑鳩小学校の長寿命化工事に向けた基本計画',
    '大和郡山市消防団第三分団庫建設工事に伴う監理業務委託',
];
const DATE_FILTER_EXEMPT_TITLES = [
    '三宅町つながり総合センター解体工事設計委託業務',
    '山添村義務教育学校建設基本計画業務',
];

function getPreviousFiscalYearStart(referenceDate = new Date()): Date {
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth() + 1;
    const currentFiscalYear = month >= 4 ? year : year - 1;
    return new Date(`${currentFiscalYear - 1}-04-01T00:00:00+09:00`);
}

export function isRecentBiddingDate(dateStr: string, referenceDate = new Date()): boolean {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return false;
    return date >= getPreviousFiscalYearStart(referenceDate);
}

function includesAny(text: string, keywords: string[]): boolean {
    return keywords.some(keyword => text.includes(keyword));
}

function matchedAny(text: string, keywords: string[]): string[] {
    return keywords.filter(keyword => text.includes(keyword));
}

/**
 * 除外キーワードが含まれているか判定する
 * @param text 判定対象のテキスト
 * @returns 除外対象であれば true
 */
export function isExclusionTarget(text: string): boolean {
    if (!text) return false;
    return includesAny(text, EXCLUSION_KEYWORDS);
}

/**
 * 収集時にフィルタで捨てられた（または際どく救済された）案件のログ。
 * 「何を採用したか」は scraper_result.json で追えるが、「何を・なぜ捨てたか」は
 * どこにも残らず、安堵町・大和高田市が丸ごと0件になっても6週間気づけなかった。
 * これを可視化するための最小限の仕組み。
 */
export type RejectionReason =
    | 'always_exclude_keyword'
    | 'exclusion_keyword'
    | 'no_architecture_context'
    | 'infra_exclude_keyword'
    | 'stale_date';

export interface RejectionLogEntry {
    municipality?: string;
    title: string;
    reason: RejectionReason;
    matchedKeywords: string[];
    borderlineRescue?: boolean;
}

let currentScrapeMunicipality: string | undefined;
let rejectionLog: RejectionLogEntry[] = [];

/** スクレイプ対象の自治体を設定する。以降の shouldKeepItem 呼び出しはこの自治体名でログされる。 */
export function setScrapeContext(municipality?: string): void {
    currentScrapeMunicipality = municipality;
}

export function getRejectionLog(): RejectionLogEntry[] {
    return rejectionLog;
}

export function clearRejectionLog(): void {
    rejectionLog = [];
    currentScrapeMunicipality = undefined;
}

function recordRejection(title: string, reason: RejectionReason, matchedKeywords: string[], borderlineRescue?: boolean, municipality?: string): void {
    rejectionLog.push({
        municipality: municipality ?? currentScrapeMunicipality,
        title,
        reason,
        matchedKeywords,
        ...(borderlineRescue ? { borderlineRescue: true } : {}),
    });
}

/**
 * 建築・コンサル系として保持すべき案件か判定する
 */
export function shouldKeepItem(title: string, otherText?: string, municipality?: string): boolean {
    const target = `${title} ${otherText || ''}`;
    const hasPriorityArchitecturePattern = includesAny(target, PRIORITY_ARCHITECTURE_PATTERNS);

    if (hasPriorityArchitecturePattern) {
        return true;
    }

    const hasArchitectureContext = includesAny(target, ARCHITECTURE_CONTEXT_KEYWORDS);
    const hasArchitectureWork = includesAny(target, ARCHITECTURE_WORK_KEYWORDS);
    const isArchitectureCandidate = hasArchitectureContext && hasArchitectureWork;

    // 「外壁」「空調」など単体の設備更新を除外するためのキーワードだが、部分一致のため
    // 「こども園南館外壁改修、トイレ乾式化及び洋式化工事」のように学校・こども園等の
    // 施設本体を対象とした複合工事まで一語で全否定してしまう。
    // 一方「公民館外壁改修工事」「体育館空調設備更新工事」のように、施設種別語＋作業語
    // だけを条件にすると、まさにこのフィルタが除外したい単体設備更新の典型例まで
    // 復活してしまう。施設種別語(学校・こども園等)に加えて、トイレ改修のような
    // 具体的な建築要素語が明記されている場合だけを「複合工事」とみなして際どく救済する。
    const hasFacilityType = includesAny(target, FACILITY_TYPE_KEYWORDS);
    const hasSpecificElement = includesAny(target, SPECIFIC_ELEMENT_KEYWORDS);
    const isComplexArchitectureWork = hasFacilityType && hasSpecificElement && hasArchitectureWork;

    const alwaysExcludeMatches = matchedAny(target, ALWAYS_EXCLUDE_KEYWORDS);
    if (alwaysExcludeMatches.length > 0 && !isComplexArchitectureWork) {
        recordRejection(title, 'always_exclude_keyword', alwaysExcludeMatches, false, municipality);
        return false;
    }

    if (includesAny(target, EXCLUSION_KEYWORDS)) {
        recordRejection(title, 'exclusion_keyword', matchedAny(target, EXCLUSION_KEYWORDS), false, municipality);
        return false;
    }

    if (!isArchitectureCandidate) {
        recordRejection(title, 'no_architecture_context', [], false, municipality);
        return false;
    }

    // 道路・水道などのインフラ案件は、建物語が偶然混ざる場合だけを除外する。
    const infraTarget = maskInfraPlaceNames(target);
    if (includesAny(infraTarget, INFRA_EXCLUDE_KEYWORDS) && !includesAny(infraTarget, INFRA_ALLOWED_KEYWORDS)) {
        recordRejection(title, 'infra_exclude_keyword', matchedAny(infraTarget, INFRA_EXCLUDE_KEYWORDS), false, municipality);
        return false;
    }

    if (alwaysExcludeMatches.length > 0) {
        recordRejection(title, 'always_exclude_keyword', alwaysExcludeMatches, true, municipality);
    }

    return true;
}

export function shouldKeepBiddingItem(item: BiddingItem, referenceDate = new Date()): boolean {
    // 除外判定にはスクレイパー由来のテキストだけを使う。
    // AI由来の要約やタグには「設備」「調査」「空調」などの語が正当な建築案件でも
    // 普通に登場するため、AI付与後のテキストで除外すると、スクレイプ時に通過した
    // 案件が品質チェックで「対象外」に反転してCIが失敗する。
    // （タグは常にAI生成なので除外判定には使わない）
    const isAiDescription = item.isIntelligenceExtracted === true || item.extractionSource === 'gemini';
    const exclusionText = isAiDescription
        ? item.title
        : `${item.title} ${item.description || ''}`;

    // shouldKeepItem 本体と同じ基準(施設種別語+具体的建築要素語+作業語)で
    // 際どい救済の可否を揃える。hasArchitectureContext(施設種別語+要素語の混合)だけを
    // 条件にすると、「公民館外壁改修工事」のような単体設備更新まで救済してしまう。
    const hasArchitectureWork = includesAny(exclusionText, ARCHITECTURE_WORK_KEYWORDS);
    const isComplexArchitectureWork = includesAny(exclusionText, FACILITY_TYPE_KEYWORDS)
        && includesAny(exclusionText, SPECIFIC_ELEMENT_KEYWORDS)
        && hasArchitectureWork;
    if (includesAny(exclusionText, ALWAYS_EXCLUDE_KEYWORDS) && !isComplexArchitectureWork) {
        return false;
    }

    // タイトル単体で判定できない案件は、補足テキストでの救済を許す
    const textToMatch = [
        item.title,
        item.description || '',
        ...(item.tags || []),
    ].join(' ');
    const titleMatches = shouldKeepItem(item.title, undefined, item.municipality);
    const matches = titleMatches || shouldKeepItem(textToMatch, undefined, item.municipality);

    if (DATE_FILTER_EXEMPT_TITLES.includes(item.title)) {
        return matches;
    }

    return isRecentBiddingDate(item.announcementDate, referenceDate) && matches;
}

export type WinnerType = 'ゼネコン' | '設計事務所' | 'その他';

/**
 * 業者名から「ゼネコン（施工）」か「設計事務所（コンサル）」かを判定する
 */
export function classifyWinner(name: string): WinnerType | undefined {
    if (!name) return undefined;

    // 設計事務所・コンサルのキーワード
    if (name.includes('設計') || name.includes('コンサル') || name.includes('測量') || name.includes('補償') || name.includes('地質')) {
        return '設計事務所';
    }

    // ゼネコン・施工のキーワード
    if (name.includes('建設') || name.includes('工業') || name.includes('工務店') || name.includes('土木') || name.includes('組')) {
        return 'ゼネコン';
    }

    // デフォルト（または不明）
    return 'ゼネコン';
}

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
];

const DEFAULT_INFRA_EXCLUDE_KEYWORDS = [
    '道路', '橋梁', '河川', '砂防', '舗装', '法面', '護岸', '浚渫',
    '排水路', '側溝', '水路', '堤防', 'トンネル', 'ガードレール',
    '標識', '区画線', '配水管', '布設', '水道', '下水道',
    '農道', '林道', '池改修', 'ため池', '交通安全施設',
    '浄水場', '井戸',
];

const DEFAULT_ARCHITECTURE_CONTEXT_KEYWORDS = [
    '建築', '建物', '庁舎', '校舎', '学校', '小学校', '中学校',
    '小中学校', '屋内運動場',
    '幼稚園', 'こども園', '保育園', '保育所', '認定こども園',
    '公民館', '会館', 'センター', '体育館', '図書館', '消防署',
    '交番', '住宅', '市営住宅', '団地', '施設', 'ホール',
    'ハウス', 'はうす',
    'トイレ', '便所', '外壁', '屋根', '内装', '空調', '受水槽',
    '給水設備', '受変電設備', '防火戸', '耐震', 'エレベーター', 'EV', '仮眠室',
    '書庫', '温水設備', '吸収冷温水機', '非常用自家発電設備',
];

const DEFAULT_ARCHITECTURE_WORK_KEYWORDS = [
    '工事', '修繕', '改修', '新築', '増築', '設計', '実施設計',
    '基本設計', '工事監理', '耐震診断', '建築設備設計', '更新', '設置',
];

const ALWAYS_EXCLUDE_KEYWORDS = [...new Set([...DEFAULT_ALWAYS_EXCLUDE_KEYWORDS, ...dataFilters.alwaysExcludeKeywords])];
const INFRA_EXCLUDE_KEYWORDS = [...new Set([...DEFAULT_INFRA_EXCLUDE_KEYWORDS, ...dataFilters.infraExcludeKeywords])];
const ARCHITECTURE_CONTEXT_KEYWORDS = [...new Set([...DEFAULT_ARCHITECTURE_CONTEXT_KEYWORDS, ...dataFilters.architectureContextKeywords])];
const ARCHITECTURE_WORK_KEYWORDS = [...new Set([...DEFAULT_ARCHITECTURE_WORK_KEYWORDS, ...dataFilters.architectureWorkKeywords])];
const INFRA_ALLOWED_KEYWORDS = dataFilters.infraAllowedKeywords;
const PRIORITY_ARCHITECTURE_PATTERNS = [
    '特定建築物定期調査',
    '建築設備定期検査',
    '防火設備定期検査',
    '防火対象物定期点検',
    '消防用設備等法定点検',
    '受変電設備改修',
    '屋内運動場空調設備',
    '空調設備設置工事',
    '屋内運動場空調等工事',
    '芝運動公園運動場等再整備基本設計業務',
    '立地適正化計画改定業務',
    '安堵町総合センターひびき施設管理業務委託',
    '天理市立施設LED照明機器賃貸借（リース）業務',
    '下水道施設耐震診断・実施設計業務委託（その１）',
    '平和地区公民館庭園・築山・多目的グラウンド等維持管理業務',
    'かんざん園高圧機器更新業務',
    '公共下水道昭和工業団地地区改築実施設計業務委託',
    '郡山城跡周辺維持管理業務委託薬剤散布',
    '土木工事等技術支援業務',
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
 * 建築・コンサル系として保持すべき案件か判定する
 */
export function shouldKeepItem(title: string, otherText?: string): boolean {
    const target = `${title} ${otherText || ''}`;
    const hasPriorityArchitecturePattern = includesAny(target, PRIORITY_ARCHITECTURE_PATTERNS);

    if (hasPriorityArchitecturePattern) {
        return true;
    }

    // 一般業務・物品・広報系は、入札語を含んでも建築案件ではないため除外する。
    if (includesAny(target, ALWAYS_EXCLUDE_KEYWORDS)) {
        return false;
    }

    if (includesAny(target, EXCLUSION_KEYWORDS)) {
        return false;
    }

    const hasArchitectureContext = includesAny(target, ARCHITECTURE_CONTEXT_KEYWORDS);
    const hasArchitectureWork = includesAny(target, ARCHITECTURE_WORK_KEYWORDS);

    if (!hasArchitectureContext || !hasArchitectureWork) {
        return false;
    }

    // 道路・水道などのインフラ案件は、建物語が偶然混ざる場合だけを除外する。
    if (includesAny(target, INFRA_EXCLUDE_KEYWORDS) && !includesAny(target, INFRA_ALLOWED_KEYWORDS)) {
        return false;
    }

    return true;
}

export function shouldKeepBiddingItem(item: BiddingItem, referenceDate = new Date()): boolean {
    const textToMatch = [
        item.title,
        item.description || '',
        item.winningContractor || '',
        item.designFirm || '',
        ...(item.tags || [])
    ].join(' ');

    return isRecentBiddingDate(item.announcementDate, referenceDate) && shouldKeepItem(textToMatch);
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

/**
 * 土木系案件を除外するための共通フィルタ
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

    // --- 測量・地質・環境調査系 ---
    '測量', '地質', '用地', '補償', '境界', '物件調査',
    '交通量', '騒音', '振動', '環境調査', 'アセスメント',
    '土地評価', '土壌汚染', '家屋調査', '流量観測',

    // --- 物品・備品・消耗品・リース系 ---
    '備品', '消耗品', '購入', 'リース', '賃貸借', '物品', 
    '事務用品', '文房具', '用紙', '封筒', '印章', '印刷', '製本',
    '家具', '机', '椅子', 'ロッカー', '棚', 'キャビネット',
    '被服', '制服', '作業服', '寝具', 'タオル', 'テント',
    '燃料', 'ガソリン', '軽油', '灯油', '重油', 'プロパンガス', '高圧ガス',
    '医薬品', '試薬', '医療用品', '介護用品', '工業薬品', '厨房機器',
    'ＯＡ機器', 'パソコン', 'ＰＣ', 'サーバー', '周辺機器', 'プリンタ', 'コピー機',
    'ソフトウェア', 'ライセンス', '保守契約', '通信機器', '無線機',
    '看板', '掲示板', '案内板', '車両', '特装車', '乗用車', '搬送',
    '自動車', '自転車', 'タイヤ', '部品購入', '楽器', '体育用品',
    '消防用品', '防災用品', '非常食', '記念品', '贈答品', '日用品',

    // --- その他一般ノイズ・役務 (建築・設計以外) ---
    'マラソン', '職員採用', '広報', '官報', '給食', '警備', '受付', 
    '補助金', '助成金', 'セミナー', '研修', 'イベント委託',
    'システム開発', '保守管理', 'ポータルサイト', '健康診断'
];

/**
 * 除外キーワードが含まれているか判定する
 * @param text 判定対象のテキスト
 * @returns 除外対象であれば true
 */
export function isExclusionTarget(text: string): boolean {
    if (!text) return false;
    return EXCLUSION_KEYWORDS.some(keyword => text.includes(keyword));
}

/**
 * 建築・コンサル系として保持すべき案件か判定する
 * (土木系キーワードを含まず、かつ建築、設計、調査、コンサル等のキーワードを含む場合に推奨)
 */
export function shouldKeepItem(title: string, gyoshu?: string): boolean {
    const target = `${title} ${gyoshu || ''}`;

    // 除外キーワードが含まれていれば除外
    if (isExclusionTarget(target)) {
        return false;
    }

    // 特定の保守・維持管理（土木的）も除外したい場合
    if (target.includes('維持修繕') && !target.includes('建築')) {
        return false;
    }

    return true;
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

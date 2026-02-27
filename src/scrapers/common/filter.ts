/**
 * 土木系案件を除外するための共通フィルタ
 */

export const CIVIL_ENGINEERING_KEYWORDS = [
    '道路', '橋梁', '河川', '砂防', '舗装', '法面', 'ダム',
    '排水路', '側溝', '水路', '堤防', 'トンネル', 'ガードレール',
    '標識', '街灯', '除草', '清掃', '下水道', '上水道',
    '橋', '土木', '砂利', 'アスファルト', '信号機',
    '測量', '地質', '用地', '補償', '境界', '物件調査',
    '交通量', '騒音', '振動', '環境調査', 'アセスメント'
];

/**
 * 案件名や業種に土木系キーワードが含まれているか判定する
 * @param text 判定対象のテキスト
 * @returns 土木系であれば true
 */
export function isCivilEngineering(text: string): boolean {
    if (!text) return false;
    return CIVIL_ENGINEERING_KEYWORDS.some(keyword => text.includes(keyword));
}

/**
 * 建築・コンサル系として保持すべき案件か判定する
 * (土木系キーワードを含まず、かつ建築、設計、調査、コンサル等のキーワードを含む場合に推奨)
 */
export function shouldKeepItem(title: string, gyoshu?: string): boolean {
    const target = `${title} ${gyoshu || ''}`;

    // 土木系キーワードが含まれていれば除外
    if (isCivilEngineering(target)) {
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

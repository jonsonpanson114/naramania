import { MUNICIPALITY_SOURCES } from './municipality_sources';

/**
 * 利用者が設定画面で選んだ内容。ブラウザの localStorage に保存する。
 *
 * 【なぜ共通化するか】
 * 以前は設定画面が自分で読み書きするだけで、他の画面が一切読んでいなかった。
 * 表示件数を変えても一覧は常に20件のままで、対象自治体も効かなかった。
 * 保存する側と使う側でキーや形が食い違わないよう、1か所にまとめる。
 *
 * 自治体は id と実データの自治体名を一致させる。
 * 以前は id が 'tawaramoto'、表示が '磯城郡田原本町' で、案件データ側の
 * '田原本町' とどちらとも一致せず、そもそも突き合わせられなかった。
 */

export const SETTINGS_STORAGE_KEY = 'naramania_settings';

export const ITEMS_PER_PAGE_OPTIONS = [10, 20, 50, 100] as const;
export const DEFAULT_ITEMS_PER_PAGE = 20;

export type MunicipalitySetting = {
    id: string;
    label: string;
    enabled: boolean;
};

export type UserSettings = {
    municipalities: MunicipalitySetting[];
    itemsPerPage: number;
};

/** 収集対象として設定されている自治体から作る。実データと必ず一致する */
export function getDefaultMunicipalitySettings(): MunicipalitySetting[] {
    return Array.from(new Set(MUNICIPALITY_SOURCES.map((group) => group.municipality)))
        .map((municipality) => ({ id: municipality, label: municipality, enabled: true }));
}

export function getDefaultSettings(): UserSettings {
    return {
        municipalities: getDefaultMunicipalitySettings(),
        itemsPerPage: DEFAULT_ITEMS_PER_PAGE,
    };
}

/**
 * 保存済みの設定を読む。サーバー側では既定値を返す。
 *
 * 呼び出し側は必ずマウント後(useEffect)に呼ぶこと。
 * 初回レンダリングで localStorage を読むと、サーバーの出力と食い違って
 * ハイドレーションエラーになる。
 */
export function loadUserSettings(): UserSettings {
    const defaults = getDefaultSettings();
    if (typeof window === 'undefined') return defaults;

    try {
        const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (!stored) return defaults;

        const parsed = JSON.parse(stored) as Partial<UserSettings>;

        // 保存済みの選択のうち、いまも収集対象である自治体だけを引き継ぐ。
        // 自治体が増減しても、消えた自治体の設定が残って悪さをしないようにする。
        const municipalities = defaults.municipalities.map((entry) => {
            const saved = parsed.municipalities?.find((item) => item?.id === entry.id);
            return saved ? { ...entry, enabled: saved.enabled !== false } : entry;
        });

        const itemsPerPage = ITEMS_PER_PAGE_OPTIONS.includes(parsed.itemsPerPage as never)
            ? (parsed.itemsPerPage as number)
            : defaults.itemsPerPage;

        return { municipalities, itemsPerPage };
    } catch {
        return defaults;
    }
}

export function saveUserSettings(settings: UserSettings): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

/** 選択されている自治体名。すべて有効なら null（＝絞り込まない） */
export function getEnabledMunicipalityNames(settings: UserSettings): string[] | null {
    const enabled = settings.municipalities.filter((entry) => entry.enabled).map((entry) => entry.id);
    if (enabled.length === settings.municipalities.length) return null;
    return enabled;
}

'use client';

import { useSyncExternalStore } from 'react';
import {
    SETTINGS_STORAGE_KEY,
    getDefaultSettings,
    loadUserSettings,
    saveUserSettings,
    type UserSettings,
} from './user_settings';

/**
 * 設定を読むためのフック。
 *
 * localStorage はReactの外にある状態なので useSyncExternalStore で購読する。
 * useEffect の中で setState する書き方は、サーバー出力との食い違いは避けられるが
 * 描画が二重になり、react-hooks/set-state-in-effect にも引っかかる。
 *
 * 同じタブ内での変更も拾いたいので、保存時に独自イベントを飛ばす。
 * storage イベントは他のタブでの変更しか発火しないため、それだけでは
 * 設定画面で保存しても同じタブの一覧が古いままになる。
 */

const SETTINGS_CHANGED_EVENT = 'naramania:settings-changed';

/** サーバー側と初期表示で使う不変の既定値。毎回新しい物を返すと再描画が止まらない */
const SERVER_SNAPSHOT: UserSettings = getDefaultSettings();

let cachedRaw: string | null = null;
let cachedSettings: UserSettings = SERVER_SNAPSHOT;

function getSnapshot(): UserSettings {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    // 中身が変わっていなければ同じ参照を返す。useSyncExternalStore は
    // 参照が変わると再描画するため、毎回作り直すと無限ループになる。
    if (raw !== cachedRaw) {
        cachedRaw = raw;
        cachedSettings = loadUserSettings();
    }
    return cachedSettings;
}

function getServerSnapshot(): UserSettings {
    return SERVER_SNAPSHOT;
}

function subscribe(onChange: () => void): () => void {
    window.addEventListener('storage', onChange);
    window.addEventListener(SETTINGS_CHANGED_EVENT, onChange);
    return () => {
        window.removeEventListener('storage', onChange);
        window.removeEventListener(SETTINGS_CHANGED_EVENT, onChange);
    };
}

export function useUserSettings(): UserSettings {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** 保存し、同じタブの購読者にも変更を知らせる */
export function updateUserSettings(settings: UserSettings): void {
    saveUserSettings(settings);
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
}

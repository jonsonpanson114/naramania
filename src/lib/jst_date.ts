/**
 * 日本時間(Asia/Tokyo)固定の日付ユーティリティ。
 *
 * 【なぜ必要か】
 * 画面の「今日」を new Date().toISOString() から作っていたため、
 * UTCで動くサーバー(Vercel)では日本時間の 0:00〜9:00 のあいだ前日扱いになり、
 * 「直近開札」の集計期間が丸一日ずれていた。
 * 同じファイル内で片方はローカル時刻から組み立てており、基準も揃っていなかった。
 *
 * 【方針】
 * 実行環境のタイムゾーンに依存しないよう、必ず timeZone: 'Asia/Tokyo' を渡す。
 * 日付キーは en-CA ロケールが YYYY-MM-DD を返す性質を使う。
 * 手で 9時間足す方式は、そのあと toISOString() を呼ぶと元に戻ってしまい
 * 誤りが混ざりやすいので使わない。
 */

/** 日本時間での YYYY-MM-DD */
export function toJstDateKey(date: Date = new Date()): string {
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
}

/** 日本時間で n 日後(負なら前)の YYYY-MM-DD */
export function addDaysJstDateKey(days: number, base: Date = new Date()): string {
    return toJstDateKey(new Date(base.getTime() + days * 24 * 60 * 60 * 1000));
}

/** 画面表示用の「2026年9月7日」形式(日本時間) */
export function formatJstDateLabel(date: Date = new Date()): string {
    return date.toLocaleDateString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

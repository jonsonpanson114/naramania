/**
 * データがきちんと更新され続けているかを判定する。
 *
 * 【なぜ必要か】
 * スクレイパーのバグでDaily ScrapeがValidate Qualityで落ちると、commit/pushまで
 * 到達しないためデータが更新されなくなる。CIは初回から赤くなっていたが失敗通知が
 * どこにも無く、画面も「データ更新: 8/19」と日付を出すだけで鮮度を判定していな
 * かったため、2日間気づけなかった。
 *
 * 【週末に誤報を出さないこと】
 * 収集は平日のみ動く(cron: 1-5)。単純な「最終更新からN日」で判定すると、
 * 金曜更新→日曜閲覧が常に「2日古い」となり毎週末に誤報が出る。そこで
 * 「本来動くはずだった実行が何回スキップされたか」で数える。
 */

/** Daily Scrapeの実行時刻(日本時間)。daily_scrape.ymlのcronと対応 */
const RUN_HOURS_JST = [10, 15];
/** 実行に30分ほどかかるため、予定時刻の直後は猶予を持たせる */
const GRACE_HOURS = 2;
/** 長期間放置されても走査が無限にならないための上限 */
const MAX_LOOKBACK_DAYS = 60;

export interface DataFreshness {
    /** 判定に使った最終更新時刻。取得できなければ null */
    lastUpdated: Date | null;
    /** 本来届くはずの収集を何回取りこぼしたか */
    missedRuns: number;
    /** 警告を出すべきか */
    isStale: boolean;
    /** 画面に出す一文。正常時は null */
    message: string | null;
}

function toJst(date: Date): Date {
    return new Date(date.getTime() + 9 * 60 * 60 * 1000);
}

function isWeekdayJst(jst: Date): boolean {
    const day = jst.getUTCDay();
    return day >= 1 && day <= 5;
}

/** JST基準のその日の hour 時を、実時刻(UTC基準のDate)として返す */
function runTimeOf(jstMidnight: Date, hour: number): Date {
    const base = Date.UTC(
        jstMidnight.getUTCFullYear(),
        jstMidnight.getUTCMonth(),
        jstMidnight.getUTCDate(),
        hour, 0, 0,
    );
    return new Date(base - 9 * 60 * 60 * 1000);
}

/**
 * 最終更新以降に「動くはずだったのに結果が届かなかった実行」を数える。
 * 週末と、まだ実行時刻(＋猶予)を迎えていない分はカウントしない。
 */
export function getDataFreshness(generatedAt?: string | null, now: Date = new Date()): DataFreshness {
    if (!generatedAt) {
        return { lastUpdated: null, missedRuns: 0, isStale: false, message: null };
    }

    const lastUpdated = new Date(generatedAt);
    if (Number.isNaN(lastUpdated.getTime())) {
        return { lastUpdated: null, missedRuns: 0, isStale: false, message: null };
    }

    let missedRuns = 0;

    // 最終更新の当日から今日まで、平日の各実行スロットを順に確認する。
    // 同じ日でも最終更新より後のスロット(例: 10時更新→15時便)は対象になる。
    const cursor = toJst(lastUpdated);
    cursor.setUTCHours(0, 0, 0, 0);

    const today = toJst(now);
    today.setUTCHours(0, 0, 0, 0);

    for (let i = 0; i < MAX_LOOKBACK_DAYS && cursor.getTime() <= today.getTime(); i += 1) {
        if (isWeekdayJst(cursor)) {
            for (const hour of RUN_HOURS_JST) {
                const scheduled = runTimeOf(cursor, hour);
                if (scheduled.getTime() <= lastUpdated.getTime()) continue; // 更新前の便は対象外
                const dueBy = scheduled.getTime() + GRACE_HOURS * 60 * 60 * 1000;
                if (dueBy <= now.getTime()) missedRuns += 1;
            }
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    if (missedRuns === 0) {
        return { lastUpdated, missedRuns, isStale: false, message: null };
    }

    const message = missedRuns >= 4
        ? 'データが更新されていません。収集が続けて失敗している可能性があります。'
        : 'データが最新ではありません。前回の収集結果が届いていません。';

    return { lastUpdated, missedRuns, isStale: true, message };
}

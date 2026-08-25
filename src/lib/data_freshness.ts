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
/**
 * 奈良県だけは別ワークフロー(nara_prefecture_scrape.yml)で平日22:00に動く。
 * 自前のWindowsランナーが必要な構成で失敗しやすく、Daily Scrapeが全て成功して
 * いても奈良県だけ数日止まることがある(実際に8/20→8/25で5日間停止した)。
 */
const NARA_PREF_RUN_HOURS_JST = [7, 22];
const NARA_PREF = '奈良県';
/**
 * 7:00と22:00の2便あり、どちらかが通ればその日のデータは入る。
 * 1便落ちた程度では警告せず、2便続けて落ちた時点で知らせる。
 */
const NARA_PREF_MISSED_THRESHOLD = 2;
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
function countMissedRuns(lastUpdated: Date, now: Date, runHoursJst: number[]): number {
    let missedRuns = 0;

    // 最終更新の当日から今日まで、平日の各実行スロットを順に確認する。
    // 同じ日でも最終更新より後のスロット(例: 10時更新→15時便)は対象になる。
    const cursor = toJst(lastUpdated);
    cursor.setUTCHours(0, 0, 0, 0);

    const today = toJst(now);
    today.setUTCHours(0, 0, 0, 0);

    for (let i = 0; i < MAX_LOOKBACK_DAYS && cursor.getTime() <= today.getTime(); i += 1) {
        if (isWeekdayJst(cursor)) {
            for (const hour of runHoursJst) {
                const scheduled = runTimeOf(cursor, hour);
                if (scheduled.getTime() <= lastUpdated.getTime()) continue; // 更新前の便は対象外
                const dueBy = scheduled.getTime() + GRACE_HOURS * 60 * 60 * 1000;
                if (dueBy <= now.getTime()) missedRuns += 1;
            }
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return missedRuns;
}

export function getDataFreshness(generatedAt?: string | null, now: Date = new Date()): DataFreshness {
    if (!generatedAt) {
        return { lastUpdated: null, missedRuns: 0, isStale: false, message: null };
    }

    const lastUpdated = new Date(generatedAt);
    if (Number.isNaN(lastUpdated.getTime())) {
        return { lastUpdated: null, missedRuns: 0, isStale: false, message: null };
    }

    const missedRuns = countMissedRuns(lastUpdated, now, RUN_HOURS_JST);

    if (missedRuns === 0) {
        return { lastUpdated, missedRuns, isStale: false, message: null };
    }

    const message = missedRuns >= 4
        ? 'データが更新されていません。収集が続けて失敗している可能性があります。'
        : 'データが最新ではありません。前回の収集結果が届いていません。';

    return { lastUpdated, missedRuns, isStale: true, message };
}

export interface MunicipalityFreshness {
    municipality: string;
    lastUpdated: Date;
    missedRuns: number;
}

/**
 * 自治体単位で収集が止まっていないかを見る。
 *
 * 全体のgeneratedAtはDaily Scrapeでも奈良県スクレイプでも更新されるため、
 * それだけ見ていると「Daily Scrapeは毎日通っているが奈良県だけ5日止まっている」
 * という片側停止を見逃す(実際に見逃した)。自治体ごとの最終収集時刻から判定する。
 */
export function getStaleMunicipalities(
    municipalityLastScraped?: Record<string, string> | null,
    now: Date = new Date(),
): MunicipalityFreshness[] {
    if (!municipalityLastScraped) return [];

    const stale: MunicipalityFreshness[] = [];
    for (const [municipality, iso] of Object.entries(municipalityLastScraped)) {
        const lastUpdated = new Date(iso);
        if (Number.isNaN(lastUpdated.getTime())) continue;

        const isNaraPref = municipality === NARA_PREF;
        const missedRuns = countMissedRuns(
            lastUpdated,
            now,
            isNaraPref ? NARA_PREF_RUN_HOURS_JST : RUN_HOURS_JST,
        );
        const threshold = isNaraPref ? NARA_PREF_MISSED_THRESHOLD : 2;

        if (missedRuns >= threshold) {
            stale.push({ municipality, lastUpdated, missedRuns });
        }
    }

    return stale.sort((a, b) => b.missedRuns - a.missedRuns);
}

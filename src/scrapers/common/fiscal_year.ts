/**
 * 年度（4月始まり）関連の共通ヘルパー。
 * 年度ハードコードによる「年度替わりでスクレイパーが古いページを見続ける」事故を防ぐ。
 */

/** 基準日時点の年度の開始暦年を返す（2026-07 → 2026、2026-02 → 2025） */
export function getFiscalYearStart(referenceDate = new Date()): number {
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth() + 1;
    return month >= 4 ? year : year - 1;
}

/** 基準日時点の令和年度を返す（2026年度 → 令和8年度） */
export function getCurrentReiwaFiscalYear(referenceDate = new Date()): number {
    return getFiscalYearStart(referenceDate) - 2018;
}

/** 年度ページの月表記を暦年に変換する（4〜12月=年度開始年、1〜3月=翌年） */
export function fiscalMonthToCalendarYear(fiscalYearStart: number, month: number): number {
    return month >= 4 ? fiscalYearStart : fiscalYearStart + 1;
}

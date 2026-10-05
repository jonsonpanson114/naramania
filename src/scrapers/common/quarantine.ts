import type { BiddingItem } from '../../types/bidding';
import { getDateIntegrityProblem } from '../../lib/quality_summary';

/**
 * 書き出し前に、日付・状態が矛盾している案件だけを隔離する。
 *
 * 品質チェック(validate:quality)はこの矛盾を1件でも見つけると失敗し、
 * その日のデータ更新が丸ごと保存されなくなる。外部サイトのPDFが1件読めない
 * といった一時的な不具合で全自治体の更新が止まっていた(2026-10-05 橿原市)。
 *
 * - 前回保存分に同じ案件の正常な版があれば、それに差し戻す(情報を失わない)
 * - 無ければ今回は載せない(次回の収集で取り直す)
 * - ただし矛盾が多いときは隔離しない。1件の取りこぼしではなく、
 *   スクレイパー自体が壊れている可能性が高いので、品質チェックで止めて気づかせる
 */

export type QuarantinedItem = {
    municipality: string;
    title: string;
    problem: string;
    action: 'restored' | 'dropped';
};

export type QuarantineResult = {
    items: BiddingItem[];
    quarantined: QuarantinedItem[];
    /** 矛盾が多すぎて隔離を見送った(品質チェックで止める) */
    skippedAsSystemic: boolean;
};

/** これを超えたら「一時的な取りこぼし」ではなく「壊れている」とみなす */
export const MAX_QUARANTINE_COUNT = 5;

export function quarantineInconsistentItems(
    items: BiddingItem[],
    previousItems: BiddingItem[],
): QuarantineResult {
    const flagged = items
        .map(item => ({ item, problem: getDateIntegrityProblem(item) }))
        .filter((entry): entry is { item: BiddingItem; problem: string } => entry.problem !== null);

    if (flagged.length === 0) return { items, quarantined: [], skippedAsSystemic: false };
    if (flagged.length > MAX_QUARANTINE_COUNT) return { items, quarantined: [], skippedAsSystemic: true };

    const previousById = new Map(previousItems.map(item => [item.id, item]));
    const flaggedIds = new Set(flagged.map(entry => entry.item.id));
    const quarantined: QuarantinedItem[] = [];
    const replacements = new Map<string, BiddingItem>();

    for (const { item, problem } of flagged) {
        const previous = previousById.get(item.id);
        const restorable = previous && getDateIntegrityProblem(previous) === null;
        if (restorable) replacements.set(item.id, previous);
        quarantined.push({
            municipality: item.municipality,
            title: item.title,
            problem,
            action: restorable ? 'restored' : 'dropped',
        });
    }

    const result = items
        .filter(item => !flaggedIds.has(item.id) || replacements.has(item.id))
        .map(item => replacements.get(item.id) ?? item);

    return { items: result, quarantined, skippedAsSystemic: false };
}

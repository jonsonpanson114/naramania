import assert from 'node:assert/strict';
import { MAX_QUARANTINE_COUNT, quarantineInconsistentItems } from '../src/scrapers/common/quarantine';
import { buildDateAuditSummary } from '../src/lib/quality_summary';
import type { BiddingItem } from '../src/types/bidding';

// 書き出し前の隔離が「1件の不備で全体を止めない」「壊れているときは隠さない」を守るか。

const base = (id: string, patch: Partial<BiddingItem> = {}): BiddingItem => ({
    id,
    municipality: '橿原市',
    title: `案件${id}`,
    type: '建築',
    announcementDate: '2026-09-01',
    biddingDate: '2026-09-10',
    link: 'https://example.jp',
    status: '落札',
    winningContractor: '株式会社テスト',
    ...patch,
});

// 1) 2026-10-05 の再現: PDFが読めず開札日が抜けた1件。前回の正常な版に差し戻す
{
    const previous = [base('a'), base('b')];
    const current = [base('a', { biddingDate: undefined }), base('b'), base('c')];
    const result = quarantineInconsistentItems(current, previous);
    assert.equal(result.items.length, 3, '残りは保存する');
    assert.equal(result.quarantined.length, 1);
    assert.equal(result.quarantined[0].action, 'restored');
    assert.equal(result.items.find(item => item.id === 'a')?.biddingDate, '2026-09-10', '前回の開札日に戻る');
    assert.equal(buildDateAuditSummary(result.items).awardedWithoutBiddingDateCount, 0, '品質チェックを通る');
}

// 2) 前回に正常な版が無い新規案件は、今回は載せない
{
    const result = quarantineInconsistentItems([base('new', { biddingDate: undefined }), base('ok')], []);
    assert.deepEqual(result.items.map(item => item.id), ['ok']);
    assert.equal(result.quarantined[0].action, 'dropped');
}

// 3) 矛盾が多すぎるときは隔離しない(故障を隠さず、品質チェックで止める)
{
    const broken = Array.from({ length: MAX_QUARANTINE_COUNT + 1 }, (_, i) => base(`x${i}`, { biddingDate: undefined }));
    const result = quarantineInconsistentItems(broken, []);
    assert.equal(result.skippedAsSystemic, true);
    assert.equal(result.items.length, broken.length, '手を付けずに残す');
    assert.ok(buildDateAuditSummary(result.items).awardedWithoutBiddingDateCount > 0, '品質チェックは失敗する');
}

// 4) 問題が無ければ何もしない
{
    const items = [base('a'), base('b', { status: '受付中', winningContractor: undefined })];
    const result = quarantineInconsistentItems(items, []);
    assert.equal(result.items, items);
    assert.equal(result.quarantined.length, 0);
}

console.log('隔離検証: 4 scenarios passed (差し戻し・新規除外・故障時は隔離しない・正常時は無変更)');

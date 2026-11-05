import assert from 'node:assert/strict';
import {
    carryForwardMunicipalityEnrichment,
    OPEN_WITHOUT_BIDDING_DATE_MAX_DAYS,
    reconcileStatusByDates,
} from '../src/scrapers/common/item_carryover';
import { sanitizeProjectBrief, selectBriefTargets } from '../src/scrapers/common/project_brief';
import { shouldKeepBiddingItem } from '../src/scrapers/common/filter';
import type { BiddingItem } from '../src/types/bidding';

// 案件の中身の読み取りと、再収集での引き継ぎ、受付中の補正を検証する。

const NOW = new Date('2026-11-06T03:00:00Z');
const CHECKED = '2026-11-06T03:00:00.000Z';
const item = (id: string, patch: Partial<BiddingItem> = {}): BiddingItem => ({
    id,
    municipality: '橿原市',
    title: `案件${id}`,
    type: '建築',
    announcementDate: '2026-11-01',
    biddingDate: '2026-11-20',
    link: 'https://www.city.example.jp/a.html',
    status: '受付中',
    ...patch,
});

// 1) 再収集でAIの結果が消えない。スナップショット(AIの結果なし)より掲載データが優先される
{
    const brief = { checkedAt: CHECKED, found: true, summary: '校舎のトイレを洋式へ改修する。' };
    const published = item('a', { description: 'AIの要約', tags: ['改修'], isIntelligenceExtracted: true, brief });
    const snapshot = item('a');
    const [carried] = carryForwardMunicipalityEnrichment([item('a')], [published, snapshot]);
    assert.equal(carried.description, 'AIの要約');
    assert.deepEqual(carried.tags, ['改修']);
    assert.equal(carried.isIntelligenceExtracted, true);
    assert.deepEqual(carried.brief, brief);
}

// 2) 開札日が無く公告から時間がたった案件だけを「不明」にする
{
    const today = '2026-11-06';
    const old = item('old', { biddingDate: undefined, announcementDate: '2025-07-01' });
    const recent = item('recent', { biddingDate: undefined, announcementDate: '2026-11-02' });
    const dated = item('dated', { announcementDate: '2025-07-01', biddingDate: '2026-12-01' });
    assert.equal(reconcileStatusByDates(old, today).status, '不明');
    assert.equal(reconcileStatusByDates(recent, today).status, '受付中', '今月の公告は受付中のまま');
    assert.equal(reconcileStatusByDates(dated, today).status, '受付中', '開札日が未来なら受付中のまま');
    assert.equal(reconcileStatusByDates(item('past', { biddingDate: '2026-11-01' }), today).status, '受付終了');
    assert.ok(OPEN_WITHOUT_BIDDING_DATE_MAX_DAYS >= 42, '実データの95%(42日)より短くしない');
}

// 3) 読む順番: 受付中を先に。読み終えた案件と、URLだけでは読めない案件は選ばない
{
    const done = item('done', { brief: { checkedAt: CHECKED, found: true, summary: 'x' } });
    const closed = item('closed', { status: '落札', announcementDate: '2026-11-05' });
    const open = item('open', { announcementDate: '2026-10-01' });
    const gated = item('gated', { link: 'https://nara.efftis.jp/PPI/Public/PPUBC00100?kikanno=0201' });
    const gatedPdf = item('gatedPdf', { status: '落札', link: gated.link, pdfUrl: 'https://x/a.pdf', announcementDate: '2026-01-01' });
    const stale = item('stale', { brief: { checkedAt: '2026-10-01T00:00:00.000Z', found: false } });
    const fresh = item('fresh', { brief: { checkedAt: CHECKED, found: false } });
    const ids = selectBriefTargets([done, closed, open, gated, gatedPdf, stale, fresh], NOW).map(i => i.id);
    assert.deepEqual(ids, ['stale', 'open', 'closed', 'gatedPdf']);
    assert.equal(selectBriefTargets([open, closed], NOW, 1).length, 1);
}

// 4) AIの答えの検証: 試し読みで実際に出た誤りをはじく
{
    const title = '向加名生団地屋根改修工事';
    const brief = sanitizeProjectBrief(title, {
        found: true, summary: title, period: '2', price: '不明', location: '西吉野町向加名生', qualification: 'なし',
    }, CHECKED);
    assert.equal(brief.summary, undefined, '案件名の繰り返しは概要にしない');
    assert.equal(brief.period, undefined, '「2」は工期ではない');
    assert.equal(brief.price, undefined);
    assert.equal(brief.qualification, undefined);
    assert.equal(brief.location, '西吉野町向加名生');
    assert.equal(brief.found, true);

    const good = sanitizeProjectBrief('文化会館改修設計', {
        found: true, summary: '文化会館の長寿命化に向けた改修設計と積算を行う。', period: '令和9年3月25日まで', price: '金10,450,000円',
    }, CHECKED);
    assert.equal(good.period, '令和9年3月25日まで');
    assert.equal(good.price, '金10,450,000円');

    assert.deepEqual(sanitizeProjectBrief(title, { found: false }, CHECKED), { checkedAt: CHECKED, found: false });
    assert.deepEqual(sanitizeProjectBrief(title, null, CHECKED), { checkedAt: CHECKED, found: false });
    assert.equal(sanitizeProjectBrief(title, { found: true, summary: title }, CHECKED).found, false, '使える項目が無ければ未取得');
}

// 5) brief に除外語があっても、建築フィルタの判定は変わらない
{
    const base = item('f', { title: '市立小学校校舎改修工事', status: '落札', winningContractor: '株式会社テスト' });
    const withBrief = { ...base, brief: { checkedAt: CHECKED, found: true, summary: '道路舗装と空調設備の更新を含む。' } };
    assert.equal(shouldKeepBiddingItem(withBrief, NOW), shouldKeepBiddingItem(base, NOW));
}

console.log('案件概要の検証: 5 scenarios passed (引き継ぎ・受付中の補正・読む順番・答えの検証・フィルタへの非影響)');

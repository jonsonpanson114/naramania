import assert from 'node:assert/strict';
import {
    isNaraBuildingHeadline,
    isNaraRelated,
    mergeNewsItems,
    NEWS_RETENTION_DAYS,
    parseFeedItems,
    parseNaraNpTagPage,
    type NewsItem,
} from '../src/services/news_service';

// ニュース収集の解析・絞り込み・蓄積を、外部サイトへ触らずに検証する。

const now = new Date('2026-11-05T03:00:00Z');
const article = (link: string, patch: Partial<NewsItem> = {}): NewsItem => ({
    id: link,
    source: 'constnews',
    sourceLabel: '建設ニュース',
    title: `見出し${link}`,
    date: '2026-11-04',
    link: `https://example.jp/${link}`,
    ...patch,
});

// 1) RSS 2.0 / RDF を読み、早朝の記事が日本時間の日付になる
{
    const [rss] = parseFeedItems(`<rss><channel><item>
        <title><![CDATA[新築工事を公告／桜井市]]></title><link>https://example.jp/a</link>
        <pubDate>Tue, 03 Nov 2026 22:30:00 +0000</pubDate>
        <description><![CDATA[<p>本文</p>]]></description><source url="https://x">朝日新聞</source>
    </item></channel></rss>`, 'https://example.jp/');
    assert.equal(rss.title, '新築工事を公告／桜井市');
    assert.equal(rss.date, '2026-11-04', 'UTC 22:30 は日本時間では翌日');
    assert.equal(rss.body, '本文');
    assert.equal(rss.publisher, '朝日新聞');

    const [rdf] = parseFeedItems(`<rdf:RDF xmlns:dc="d"><item><title>記事</title>
        <link>https://example.jp/b</link><dc:date>2026-11-04T09:00:00+09:00</dc:date></item></rdf:RDF>`, 'https://example.jp/');
    assert.equal(rdf.date, '2026-11-04');
}

// 2) 奈良新聞のタグページの構造を読む
{
    const items = parseNaraNpTagPage(`<ul class="cmp_article_list_row"><li class="item">
        <a href="/news/20261105205151.html"><div class="info"><time class="date lock">2026.11.05</time></div>
        <h3 class="title">奈良市「JR新駅」南側の土地区画整理事業</h3></a></li></ul>`);
    assert.equal(items.length, 1);
    assert.equal(items[0].date, '2026-11-05');
    assert.equal(items[0].link, 'https://www.nara-np.co.jp/news/20261105205151.html');
}

// 3) 実際に流れてきた見出しで絞り込みを確かめる
{
    const keep = [
        '【続報】奈良市新クリーンセンター、建設最終候補地を「北之庄町」に決定！',
        '奈良県大和郡山市の中央卸売市場再整備、大和ハウスJVが落札',
    ];
    const drop = [
        '【星のや奈良監獄】重要文化財に泊まる滞在レポート｜全室スイートの客室',
        '長谷川祐子と奈良祐希がUESHIMA MUSEUMで語ったコレクションとキュレーション',
        '横浜グリーンエクスポ 横浜市出展「つなぐ横浜館」',
        '奈良・壺阪寺の金剛力士像 解体修理で室町時代の有力仏師作と判明 [奈良県]',
        '奈良県大和高田市であす10月24日に「こども建設王国＆建設職人EXPO」',
    ];
    keep.forEach(title => assert.ok(isNaraBuildingHeadline(title), title));
    drop.forEach(title => assert.ok(!isNaraBuildingHeadline(title), title));
    assert.ok(isNaraRelated('香芝市の複合施設/事業手法を幅広く検討'), '奈良の文字が無くても市町村名で拾う');
    assert.ok(!isNaraRelated('愛知・飛島村/12月21日まで参加受付'));
}

// 4) 貯める: 既存を残し、同じ記事は増やさず、古い記事は捨てる
{
    const merged = mergeNewsItems(
        [article('old', { date: '2026-10-01' }), article('same', { excerpt: '前回' }), article('expired', { date: '2026-01-01' })],
        [article('same', { excerpt: '今回' }), article('new')],
        now,
    );
    assert.deepEqual(merged.map(item => item.link.split('/').pop()).sort(), ['new', 'old', 'same']);
    assert.equal(merged.find(item => item.link.endsWith('same'))?.excerpt, '今回');
    assert.equal(merged[merged.length - 1].link.endsWith('old'), true, '新しい順に並ぶ');
    assert.ok(NEWS_RETENTION_DAYS >= 90);
}

// 5) 同じ見出しが複数媒体にあれば専門紙を残す。日付が無い記事は見つけた日を載せる
{
    const merged = mergeNewsItems([], [
        article('google', { source: 'googlenews', title: '香芝市の複合施設を検討' }),
        article('trade', { source: 'kensetsu', title: '香芝市の複合施設を検討' }),
        article('nodate', { date: '' }),
    ], now);
    assert.equal(merged.filter(item => item.title.includes('香芝市')).length, 1);
    assert.equal(merged.find(item => item.title.includes('香芝市'))?.source, 'kensetsu');
    assert.equal(merged.find(item => item.link.endsWith('nodate'))?.date, '2026-11-05');
}

// 6) RSSの本文に残った文字コードは、保存済みの記事も含めて文字へ戻す
{
    const merged = mergeNewsItems(
        [article('stored', { excerpt: '技術提案書を２５日まで、 [&#8230;]' })],
        [article('incoming', { excerpt: '開札した。&#8230;' })],
        now,
    );
    assert.equal(merged.find(item => item.id === 'stored')?.excerpt, '技術提案書を２５日まで、…');
    assert.equal(merged.find(item => item.id === 'incoming')?.excerpt, '開札した。…');
}

console.log('ニュース検証: 6 scenarios passed (RSS解析・奈良新聞解析・絞り込み・蓄積・重複除去・文字コード)');

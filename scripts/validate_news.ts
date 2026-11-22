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
import { groupNewsByTopic } from '../src/lib/news_topics';
import { buildWatchedFirms, osakaAwardFirms, resolveWatchedFirms } from '../src/lib/watched_firms';
import type { BiddingItem } from '../src/types/bidding';
import { isNaraAddress, parseReiwaSlash, parseResultDetail } from '../src/services/osaka_pref_awards';
import { parseSakaiDate, sakaiWinner } from '../src/services/sakai_awards';
import { findWatchedFirms } from '../src/lib/watched_firms';

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

// 7) 同じ話題はまとめ、定型句だけが同じ別案件はまとめない(見出しは実データ)
{
    const titles = [
        '大和ハウスなど6社／奈良県中央卸売市場の再整備事業で基本協定、総事業費約400億円',
        '「奈良県中央卸売市場再整備推進事業（市場エリア整備事業）」に係る基本協定を締結',
        '「奈良県中央卸売市場再整備推進事業（市場エリア整備事業）」に係る基本協定を締結 (2026年11月6日掲載)',
        '１１月６日まで参加受付 板屋ヶ瀬橋橋梁補修工事',
        '広域水道Ｃ １１月６日まで参加受付 御所浄水場表洗弁・流調弁更新工事',
        '１１月１３日まで参加受付 西部生涯スポーツＣトイレ改修工事',
    ];
    const groups = groupNewsByTopic(titles.map((title, index) => article(`topic${index}`, { title })));
    assert.deepEqual(groups.map(group => group.length), [3, 1, 1, 1]);
    assert.equal(groupNewsByTopic([
        article('near', { title: titles[1], date: '2026-11-04' }),
        article('far', { title: titles[1], date: '2026-09-01' }),
    ]).length, 2, '日が離れた記事はまとめない');
}

// 8) 奈良の設計事務所の名簿と、大阪で取った記事の判定
{
    const won = (id: string, name: string): BiddingItem => ({
        id, municipality: '橿原市', title: `設計業務${id}`, type: 'コンサル', announcementDate: '2026-10-01',
        link: 'https://x', status: '落札', winningContractor: name, winnerType: '設計事務所',
    });
    const firms = buildWatchedFirms([
        won('a', '(株)福井建築設計事務所'),
        won('b', '株式会社福井建築設計事務所'),
        won('c', '協和設計株式会社'),
        won('d', '協和設計株式会社 奈良営業所'),
        won('e', '三井共同建設コンサルタント株式会社'),
        won('f', '石本・シード設計共同体'),
        won('g', '空間設計'),
        won('h', 'オリエンタルコンサルタンツ奈良事務所'),
        won('i', '(株)都市企画設計コンサルタント'),
    ]);
    assert.deepEqual(firms.map(firm => firm.key), ['シード設計', '都市企画設計コンサルタント', '福井建築設計事務所'],
        '表記ゆれは1社、奈良営業所のある本社は外、土木系・一般語は外、共同体は構成員ごと、設計の付くコンサルタントは残す');

    // 入札者の一覧がそのまま入った欄(御所市の実例)からも、設計事務所だけを拾う。施工会社は拾わない
    const bidders = buildWatchedFirms([{
        id: 'x', municipality: '御所市', title: '令和8年5月20日 入札金額(税抜き)', type: 'その他', announcementDate: '2026-05-20',
        link: 'https://x', status: '落札',
        winningContractor: '辞退 (株)村井設計 村井 利光 辞退 (株)和光設計 永友 光 (株)辰巳建築 辰巳 宗士 (有)樫本設計 山本',
    }]);
    assert.deepEqual(bidders.map(firm => firm.key), ['樫本設計', '村井設計', '和光設計']);
    assert.deepEqual(resolveWatchedFirms([won('a', '㈱中和設計')], { exclude: ['株式会社中和設計'], include: ['株式会社北和設計'] })
        .map(firm => firm.key), ['北和設計']);

    const watch = buildWatchedFirms([won('a', '(株)福井建築設計事務所')]);
    assert.deepEqual(osakaAwardFirms('福井建築設計事務所を特定／市立小学校改築基本設計／堺市', '', watch), ['(株)福井建築設計事務所']);
    assert.deepEqual(osakaAwardFirms('市立小学校改築基本設計を公告／堺市', '福井建築設計事務所', watch), [], '公告は拾わない');
    assert.deepEqual(osakaAwardFirms('福井建築設計事務所を特定／市立小学校改築／橿原市', '', watch), [], '奈良の案件は拾わない');
    assert.deepEqual(osakaAwardFirms('体育館改修設計を特定', '福井建築設計事務所が受託', watch, true), ['(株)福井建築設計事務所'],
        '大阪カテゴリの記事は地名が無くても大阪とみなす');
}

// 9) 大阪府の入札結果の詳細(実際の画面の文)から、落札者と住所を読む
{
    const decided = parseResultDetail([
        '落札企業名称', '（落札企業体名称）', '株式会社土屋総合設計', '落札企業住所', '泉佐野市湊４丁目５‐２２',
        '落札金額', '\\4,110,000（消費税及び地方消費税相当額を除く）', '入札書比較予定価格', '\\4,439,000', '入札結果', '落札者決定', '備考',
    ].join('\n'));
    assert.equal(decided.winner, '株式会社土屋総合設計');
    assert.equal(decided.address, '泉佐野市湊４丁目５‐２２');
    assert.equal(decided.decided, true);

    const pending = parseResultDetail([
        '落札企業名称', '（落札企業体名称）', '落札企業住所', '落札金額', '入札書比較予定価格', '\\7,823,000', '入札結果', '確認中', '備考',
    ].join('\n'));
    assert.equal(pending.winner, undefined, '落札者が決まる前は空');
    assert.equal(pending.decided, false);

    assert.equal(isNaraAddress('奈良県橿原市八木町1丁目'), true);
    assert.equal(isNaraAddress('橿原市八木町1丁目'), true, '県名を省いた住所');
    assert.equal(isNaraAddress('北葛城郡広陵町'), true);
    assert.equal(isNaraAddress('大阪府大阪市中央区南船場2丁目'), false);
    assert.equal(isNaraAddress('泉佐野市湊4丁目'), false);
    assert.equal(parseReiwaSlash('R08/11/10'), '2026-11-10');
}

// 10) 堺市の一覧の落札者と開札日。落札者は名簿の名前と照らす
{
    assert.equal(sakaiWinner('保留'), undefined);
    assert.equal(sakaiWinner('取止め'), undefined);
    assert.equal(sakaiWinner(' 奈良屋建築設計事務所 '), '奈良屋建築設計事務所');
    assert.equal(parseSakaiDate('令和8年05月12日'), '2026-05-12');
    assert.equal(parseSakaiDate('2026/05/12'), '2026-05-12');
    const firms = resolveWatchedFirms([], { include: ['奈良屋建築設計事務所', '株式会社彩都建築設計'] });
    assert.deepEqual(findWatchedFirms('株式会社彩都建築設計', firms).map(firm => firm.key), ['彩都建築設計']);
    assert.deepEqual(findWatchedFirms('ＨＡＤ株式会社', firms), []);
}

console.log('ニュース検証: 10 scenarios passed (RSS解析・奈良新聞解析・絞り込み・蓄積・重複除去・文字コード・話題まとめ・大阪の受注・大阪府の結果・堺市の結果)');

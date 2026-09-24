import assert from 'node:assert/strict';
import { parseTakatoriAnnouncementPage } from '../src/scrapers/takatori_ikaruga';

const url = 'https://www.town.takatori.nara.jp/contents_detail.php?frmId=2674';
const heading = '一般競争入札（郵便入札）について（令和8年9月29日入札分仕様書)';
// 2026-09-14 に確認した frmId=2674 の添付ブロック構造。
const specificationPage = `
<h1>${heading}</h1><p class="syosai_hiduke">[2026年9月10日]</p>
<h3>一般競争入札(郵便入札)に係る仕様書の閲覧について</h3>
<div class="mol_attachfileblock"><p class="mol_attachfileblock_title">ダウンロード</p><ul>
<li><a href="./cmsfiles/contents/0000002/2674/kouzi.zip">公営住宅丹生谷第1団地屋根葺替等改修工事(ファイル名：kouzi.zip サイズ：2.70MB)</a></li>
<li><a href="./cmsfiles/contents/0000002/2674/kouzikannri.zip">公営住宅丹生谷第1団地屋根葺替等改修工事監理業務(ファイル名：kouzikannri.zip サイズ：1.28MB)</a></li>
<li><a href="./cmsfiles/contents/0000002/2674/tosikeikaku.zip">都市計画法第34条第11号に係る都市計画協議図書作成及び調査業務(ファイル名：tosikeikaku.zip サイズ：989.20KB)</a></li>
</ul></div>
<h3>入札に関する注意事項</h3>
<div class="mol_attachfileblock"><p class="mol_attachfileblock_title">入札書記載における注意事項</p><ul>
<li><a href="./cmsfiles/contents/0000002/2674/chuiziko.pdf">(ファイル名：chuiziko.pdf サイズ：121.18KB)</a></li>
</ul></div>
<p><a href="/cmsfiles/contents/0000002/2430/yuubin.pdf">高取町建設工事等郵便入札の手引き</a></p>`;
const specifications = parseTakatoriAnnouncementPage(specificationPage, url, heading);
assert.equal(specifications.items.length, 3);
assert.equal(specifications.needTitleFromPdf.size, 0, '補助PDFにOCRを要求しない');
assert.equal(specifications.items[0].title, '公営住宅丹生谷第1団地屋根葺替等改修工事');
assert.equal(specifications.items[1].type, 'コンサル');
assert.ok(specifications.items.every(item => item.announcementDate === '2026-09-10' && item.biddingDate === '2026-09-29'));

const announcements = parseTakatoriAnnouncementPage(`
<h1>入札情報（令和8年9月29日執行）</h1><p class="syosai_hiduke">[2026年9月1日]</p>
<h3>入札公告</h3><div class="mol_attachfileblock"><ul>
<li><a href="/first.pdf">(ファイル名：first.pdf サイズ：400KB)</a></li>
<li><a href="/second.pdf">(ファイル名：second.pdf サイズ：400KB)</a></li>
<li><a href="/first.pdf">(ファイル名：first.pdf サイズ：400KB)</a></li>
</ul></div>`, url, heading);
assert.equal(announcements.items.length, 2, '同じ見出しの異なるPDFを両方保持し、同一URLのみ除外する');
assert.equal(new Set(announcements.items.map(item => item.id)).size, 2);
assert.equal(announcements.needTitleFromPdf.size, 2);
assert.ok(announcements.items.every(item => item.pdfUrl && announcements.needTitleFromPdf.has(item.pdfUrl)));

const questions = parseTakatoriAnnouncementPage(`
<h1>${heading}</h1><h3>質疑応答等</h3>
<div class="mol_attachfileblock"><p class="mol_attachfileblock_title">ダウンロード</p>
<a href="/answer.pdf">(ファイル名：answer.pdf サイズ：20KB)</a></div>`, url, heading);
assert.equal(questions.items.length, 0);
assert.equal(questions.needTitleFromPdf.size, 0);
console.log('高取町公告検証: 3 scenarios passed (仕様書ZIP・補助PDF除外・複数公告PDF)');

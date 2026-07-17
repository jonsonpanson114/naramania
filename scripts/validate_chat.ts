import fs from 'fs';
import path from 'path';
import { answerBiddingQuestionWithContext, type ChatContext } from '../src/services/chat_service';
import type { BiddingItem } from '../src/types/bidding';

function fail(message: string): never {
  console.error(`[chat] ${message}`);
  process.exit(1);
}

function assertIncludes(value: string, expected: string, label: string) {
  if (!value.includes(expected)) {
    fail(`${label} に "${expected}" が含まれていません: ${value}`);
  }
}

/**
 * scraper_result.json に載っている案件タイトル一覧。
 * chat検証は「チャットが正しく答えるか」というコードの回帰テストであって、
 * 特定案件が今も収集対象に載っているかのデータ検証ではない。
 * 案件は開札日を過ぎると公開サイトから消えてデータからも落ちるので、
 * ハードコードした案件が今のデータに無いときは fail せずスキップする。
 * （データ側の欠落は snapshot / live-audit 側で見る役割分担）
 */
function loadDatasetTitles(): string[] {
  const resultPath = path.join(process.cwd(), 'scraper_result.json');
  if (!fs.existsSync(resultPath)) return [];
  try {
    const items = JSON.parse(fs.readFileSync(resultPath, 'utf-8')) as BiddingItem[];
    return items.map((item) => item.title);
  } catch {
    return [];
  }
}

async function main() {
  const titles = loadDatasetTitles();
  const hasItem = (needle: string) => titles.some((title) => title.includes(needle));
  const skip = (label: string, needle: string) =>
    console.warn(`[chat] スキップ: ${label} — "${needle}" は現在のデータに存在しません（期限切れ等）`);

  let checked = 0;

  // 1) 個別案件のローカル確定回答 + 続き質問（落札者の引き継ぎ）
  if (hasItem('五條市立小学校トイレ改修工事')) {
    const first = await answerBiddingQuestionWithContext('五條市立小学校トイレ改修工事はある？');
    assertIncludes(first.answer, '五條市立小学校トイレ改修工事', '個別案件回答');
    assertIncludes(first.answer, '落札', '個別案件回答');
    assertIncludes(first.answer, '2026-05-29', '個別案件回答');
    assertIncludes(first.answer, '有希建設（株）', '個別案件回答');
    if (first.model !== 'local-answer') {
      fail(`個別案件はローカル確定回答で返すべきです: model=${first.model}`);
    }
    if (first.localMatches.length < 1) {
      fail('個別案件の localMatches が空です');
    }

    const followContext = first.context as ChatContext;
    const second = await answerBiddingQuestionWithContext(
      '落札者は？',
      [
        { role: 'user', content: '五條市立小学校トイレ改修工事はある？' },
        { role: 'assistant', content: first.answer },
      ],
      followContext,
    );
    assertIncludes(second.answer, '有希建設（株）', '続き質問回答');
    if (second.model !== 'local-answer') {
      fail(`続き質問はローカル確定回答で返すべきです: model=${second.model}`);
    }
    checked += 1;
  } else {
    skip('個別案件＋続き質問', '五條市立小学校トイレ改修工事');
  }

  // 2) 期間クエリ（特定案件に依存しない・常に検証）
  const weekly = await answerBiddingQuestionWithContext('今週の開札物件は？');
  if (!weekly.answer.trim()) {
    fail('今週の開札質問の回答が空です');
  }

  // 3) 葛城市トイレ案件
  if (hasItem('葛城市立中学校トイレ改修工事設計業務')) {
    const katsuragi = await answerBiddingQuestionWithContext('葛城市立中学校トイレ改修工事は？');
    assertIncludes(katsuragi.answer, '葛城市立中学校トイレ改修工事設計業務', '葛城市トイレ案件回答');
    assertIncludes(katsuragi.answer, '葛城市', '葛城市トイレ案件回答');
    assertIncludes(katsuragi.answer, '2026-06-12', '葛城市トイレ案件回答');
    if (katsuragi.model !== 'local-answer') {
      fail(`葛城市トイレ案件はローカル確定回答で返すべきです: model=${katsuragi.model}`);
    }
    checked += 1;
  } else {
    skip('葛城市トイレ案件', '葛城市立中学校トイレ改修工事設計業務');
  }

  // 4) 大和郡山市 落札者回答
  if (hasItem('大和郡山市立スポーツ会館体育室床修繕')) {
    const koriyamaWinner = await answerBiddingQuestionWithContext('大和郡山市立スポーツ会館体育室床修繕の落札者は？');
    assertIncludes(koriyamaWinner.answer, '大和郡山市立スポーツ会館体育室床修繕', '大和郡山市落札者回答');
    assertIncludes(koriyamaWinner.answer, 'マツダ塗装株式会社', '大和郡山市落札者回答');
    if (koriyamaWinner.model !== 'local-answer') {
      fail(`大和郡山市落札者はローカル確定回答で返すべきです: model=${koriyamaWinner.model}`);
    }
    checked += 1;
  } else {
    skip('大和郡山市落札者', '大和郡山市立スポーツ会館体育室床修繕');
  }

  // 5) 香芝市 設計案件
  if (hasItem('志都美小学校改築工事に伴う実施設計業務')) {
    const kashibaDesign = await answerBiddingQuestionWithContext('志都美小学校改築工事に伴う実施設計業務はある？');
    assertIncludes(kashibaDesign.answer, '志都美小学校改築工事に伴う実施設計業務', '香芝市設計案件回答');
    assertIncludes(kashibaDesign.answer, '香芝市', '香芝市設計案件回答');
    assertIncludes(kashibaDesign.answer, '2026-07-10', '香芝市設計案件回答');
    if (kashibaDesign.model !== 'local-answer') {
      fail(`香芝市設計案件はローカル確定回答で返すべきです: model=${kashibaDesign.model}`);
    }
    checked += 1;
  } else {
    skip('香芝市設計案件', '志都美小学校改築工事に伴う実施設計業務');
  }

  // 全案件が期限切れで消えると回帰テストとして意味をなさないので、その時は警告する。
  if (checked === 0) {
    console.warn('[chat] 警告: 検証対象の固定案件がすべて現データに存在せず、ローカル回答の回帰チェックを実行できませんでした。');
  }

  console.log(`[chat] validation passed (${checked} 件の固定案件を検証 / 期間クエリ1件)`);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});

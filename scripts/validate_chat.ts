import { answerBiddingQuestionWithContext, type ChatContext } from '../src/services/chat_service';

function fail(message: string): never {
  console.error(`[chat] ${message}`);
  process.exit(1);
}

function assertIncludes(value: string, expected: string, label: string) {
  if (!value.includes(expected)) {
    fail(`${label} に "${expected}" が含まれていません: ${value}`);
  }
}

async function main() {
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

  const weekly = await answerBiddingQuestionWithContext('今週の開札物件は？');
  if (!weekly.answer.trim()) {
    fail('今週の開札質問の回答が空です');
  }

  const katsuragi = await answerBiddingQuestionWithContext('葛城市立中学校トイレ改修工事は？');
  assertIncludes(katsuragi.answer, '葛城市立中学校トイレ改修工事設計業務', '葛城市トイレ案件回答');
  assertIncludes(katsuragi.answer, '葛城市', '葛城市トイレ案件回答');
  assertIncludes(katsuragi.answer, '2026-06-12', '葛城市トイレ案件回答');
  if (katsuragi.model !== 'local-answer') {
    fail(`葛城市トイレ案件はローカル確定回答で返すべきです: model=${katsuragi.model}`);
  }

  const koriyamaWinner = await answerBiddingQuestionWithContext('大和郡山市立スポーツ会館体育室床修繕の落札者は？');
  assertIncludes(koriyamaWinner.answer, '大和郡山市立スポーツ会館体育室床修繕', '大和郡山市落札者回答');
  assertIncludes(koriyamaWinner.answer, 'マツダ塗装株式会社', '大和郡山市落札者回答');
  if (koriyamaWinner.model !== 'local-answer') {
    fail(`大和郡山市落札者はローカル確定回答で返すべきです: model=${koriyamaWinner.model}`);
  }

  const kashibaDesign = await answerBiddingQuestionWithContext('志都美小学校改築工事に伴う実施設計業務はある？');
  assertIncludes(kashibaDesign.answer, '志都美小学校改築工事に伴う実施設計業務', '香芝市設計案件回答');
  assertIncludes(kashibaDesign.answer, '香芝市', '香芝市設計案件回答');
  assertIncludes(kashibaDesign.answer, '2026-07-10', '香芝市設計案件回答');
  if (kashibaDesign.model !== 'local-answer') {
    fail(`香芝市設計案件はローカル確定回答で返すべきです: model=${kashibaDesign.model}`);
  }

  console.log('[chat] validation passed');
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});

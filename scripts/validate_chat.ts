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

  console.log('[chat] validation passed');
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});

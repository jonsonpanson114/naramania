import fs from 'fs';
import type { BiddingItem } from '../src/types/bidding';
import { extractProjectBrief } from '../src/services/gemini_service';
import { gatherProjectSource } from '../src/services/project_source';

/**
 * 受付中の案件で概要の抽出を試し、結果を表示するだけのスクリプト。データは書き換えない。
 * Gemini のキーがCIにしか無いので verify_project_briefs.yml から実行する。
 */
async function main() {
    const items: BiddingItem[] = JSON.parse(fs.readFileSync('scraper_result.json', 'utf-8'));
    const targets = items.filter(item => item.status === '受付中');
    const lines: string[] = [`# 案件概要の試し読み (受付中 ${targets.length}件)`, ''];
    let ok = 0;

    for (const item of targets) {
        const source = await gatherProjectSource(item);
        lines.push(`## ${item.municipality} / ${item.title}`, `- 今の概要: ${item.description || '(なし)'}`);

        if (source.noSource) {
            lines.push(`- 読めず: ${source.noSource}`, '');
            continue;
        }
        const brief = await extractProjectBrief(item, source);
        lines.push(`- 読んだ資料: ページ${source.pageText ? 'あり' : 'なし'} / PDF ${source.pdfs.length}件`);
        if (!brief?.found) {
            lines.push(`- 結果: この案件の記述が資料に無い${brief ? '' : '(AIの応答なし)'}`, '');
        } else {
            ok += 1;
            for (const [label, value] of [
                ['概要', brief.summary], ['場所', brief.location], ['規模', brief.scale],
                ['工期', brief.period], ['金額', brief.price], ['参加資格', brief.qualification],
            ]) {
                if (value) lines.push(`- ${label}: ${value}`);
            }
            lines.push('');
        }
        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    lines.splice(1, 0, `読み取れた案件: ${ok} / ${targets.length}`);
    const report = lines.join('\n');
    console.log(report);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

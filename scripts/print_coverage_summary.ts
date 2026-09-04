import fs from 'fs';
import path from 'path';

/**
 * live_source_audit_report.json を人間が読める表にして出力する。
 *
 * 目的は「公告(入札情報)と結果(開札情報)の両方を取れているか」を一目で見えるようにすること。
 * 件数だけを見ていると、片方のページしか見ていない自治体でもスクレイパーが
 * 正常に動いているように見えてしまい、長期間気づけない。
 *
 * GITHUB_STEP_SUMMARY があれば GitHub Actions の実行結果画面に直接書き出すので、
 * PCがなくてもブラウザから結果を確認できる。
 */

const REPORT_PATH = path.join(process.cwd(), 'live_source_audit_report.json');

type ScraperResult = {
    municipality: string;
    rawCount: number;
    keptCount: number;
    rejectedCount: number;
    keptAnnouncementCount?: number;
    keptResultCount?: number;
    warnings?: string[];
    errors?: string[];
};

type AuditReport = {
    generatedAt?: string;
    checkedMunicipalities?: string[];
    scraperResults?: ScraperResult[];
};

type Verdict = {
    icon: string;
    label: string;
    /** 対応が必要か（公告か結果のどちらかが0件、または取得エラー） */
    needsAttention: boolean;
};

function judge(result: ScraperResult): Verdict {
    if ((result.errors?.length || 0) > 0) {
        return { icon: '❌', label: '取得エラー', needsAttention: true };
    }
    if (result.rawCount === 0) {
        return { icon: '❌', label: '0件（取得できていない）', needsAttention: true };
    }
    if (result.keptCount === 0) {
        return { icon: '➖', label: '対象案件なし（建築案件が無い期間）', needsAttention: false };
    }
    if (result.keptAnnouncementCount === undefined && result.keptResultCount === undefined) {
        // 公告/結果の内訳が入る前の古いレポート。0件と区別がつかないので判定しない。
        return { icon: '❔', label: '内訳なし（古い形式のレポート）', needsAttention: false };
    }

    const announcements = result.keptAnnouncementCount ?? 0;
    const results = result.keptResultCount ?? 0;
    if (announcements === 0) {
        return { icon: '⚠️', label: '公告が0件（入札情報ページを見落とし？）', needsAttention: true };
    }
    if (results === 0) {
        return { icon: '⚠️', label: '結果が0件（開札情報ページを見落とし？）', needsAttention: true };
    }
    return { icon: '✅', label: '公告・結果とも取得', needsAttention: false };
}

function buildMarkdown(report: AuditReport): string {
    const results = report.scraperResults || [];
    const lines: string[] = [];

    lines.push('## 収集元カバレッジ検証');
    lines.push('');
    if (report.generatedAt) lines.push(`実行日時: ${report.generatedAt}`);
    lines.push('');
    lines.push('公告（入札情報）と結果（開札情報）の**両方**が1件以上あれば ✅。');
    lines.push('片方が0件なら、そのページを見落としている可能性がある。');
    lines.push('');
    lines.push('| 自治体 | 取得(raw) | 掲載 | 公告 | 結果 | 判定 |');
    lines.push('| --- | ---: | ---: | ---: | ---: | --- |');

    for (const result of results) {
        const verdict = judge(result);
        lines.push(
            `| ${result.municipality} | ${result.rawCount} | ${result.keptCount} |`
            + ` ${result.keptAnnouncementCount ?? '-'} | ${result.keptResultCount ?? '-'} |`
            + ` ${verdict.icon} ${verdict.label} |`,
        );
    }

    const attention = results.filter((result) => judge(result).needsAttention);
    lines.push('');
    lines.push(attention.length === 0
        ? '### 要対応: なし'
        : `### 要対応: ${attention.length}自治体 — ${attention.map((r) => r.municipality).join(', ')}`);

    const messages = results.flatMap((result) => [
        ...(result.errors || []).map((message) => `- ❌ **${result.municipality}**: ${message}`),
        ...(result.warnings || []).map((message) => `- ⚠️ ${message}`),
    ]);
    if (messages.length > 0) {
        lines.push('');
        lines.push('<details><summary>警告・エラーの詳細</summary>');
        lines.push('');
        lines.push(...messages);
        lines.push('');
        lines.push('</details>');
    }

    return lines.join('\n');
}

function main() {
    if (!fs.existsSync(REPORT_PATH)) {
        const message = `[coverage-summary] ${path.basename(REPORT_PATH)} が見つかりません。監査が最後まで走らなかった可能性があります。`;
        console.error(message);
        const summaryPath = process.env.GITHUB_STEP_SUMMARY;
        if (summaryPath) fs.appendFileSync(summaryPath, `## 収集元カバレッジ検証\n\n${message}\n`, 'utf-8');
        // レポートが無いこと自体は検証ジョブを落とす理由にしない（監査ステップ側で判定済み）
        return;
    }

    const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8')) as AuditReport;
    const markdown = buildMarkdown(report);

    console.log(markdown);

    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (summaryPath) {
        fs.appendFileSync(summaryPath, `${markdown}\n`, 'utf-8');
        console.log('[coverage-summary] GitHub の実行結果画面(Summary)に出力しました。');
    }
}

main();

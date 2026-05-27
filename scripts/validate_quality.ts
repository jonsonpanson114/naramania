import fs from 'fs';
import path from 'path';
import type { QualitySummary, MunicipalityIssueEntry } from '../src/lib/quality_summary';

const QUALITY_PATH = path.join(process.cwd(), 'scraper_quality.json');
const GUARDED_MUNICIPALITIES = new Set(['奈良県']);

function fail(message: string): never {
    console.error(`[quality] ${message}`);
    process.exit(1);
}

function loadSummary(): QualitySummary {
    if (!fs.existsSync(QUALITY_PATH)) {
        fail('scraper_quality.json が見つかりません');
    }

    return JSON.parse(fs.readFileSync(QUALITY_PATH, 'utf-8')) as QualitySummary;
}

function isCriticalIssue(issue: MunicipalityIssueEntry): boolean {
    if (!GUARDED_MUNICIPALITIES.has(issue.municipality)) return false;

    if (issue.level === 'error') return true;

    return /403|forbidden|保持/.test(issue.message.toLowerCase());
}

function main() {
    const summary = loadSummary();
    const audit = summary.municipalityAudit;

    if (!audit) {
        fail('municipalityAudit がありません');
    }

    const retained = audit.retainedFromPrevious || [];
    const issues = audit.issues || [];

    const criticalRetained = retained.filter((municipality) => GUARDED_MUNICIPALITIES.has(municipality));
    if (criticalRetained.length > 0) {
        fail(`重要自治体が前回値保持中です: ${criticalRetained.join(', ')}`);
    }

    const criticalIssues = issues.filter(isCriticalIssue);
    if (criticalIssues.length > 0) {
        const messages = criticalIssues.map((issue) => `${issue.municipality}: ${issue.message}`);
        fail(`重要自治体に収集エラーがあります: ${messages.join(' | ')}`);
    }

    console.log('[quality] validation passed');
}

main();

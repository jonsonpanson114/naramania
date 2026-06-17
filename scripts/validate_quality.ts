import fs from 'fs';
import path from 'path';
import type { QualitySummary } from '../src/lib/quality_summary';
import { evaluateCriticalWatch } from '../src/lib/critical_watch';
import type { BiddingItem } from '../src/types/bidding';

const QUALITY_PATH = path.join(process.cwd(), 'scraper_quality.json');
const RESULT_PATH = path.join(process.cwd(), 'scraper_result.json');

function parseMunicipalityEnvList(value?: string): Set<string> {
    if (value === undefined) {
        return new Set(['奈良県']);
    }

    return new Set(
        value
            .split(/[,\n]/)
            .map((entry) => entry.trim())
            .filter(Boolean),
    );
}

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

function loadItems(): BiddingItem[] {
    if (!fs.existsSync(RESULT_PATH)) {
        fail('scraper_result.json が見つかりません');
    }

    return JSON.parse(fs.readFileSync(RESULT_PATH, 'utf-8')) as BiddingItem[];
}

function main() {
    const guardedMunicipalities = parseMunicipalityEnvList(process.env.QUALITY_GUARDED_MUNICIPALITIES);
    const summary = loadSummary();
    const items = loadItems();
    const audit = summary.municipalityAudit;

    if (!audit) {
        fail('municipalityAudit がありません');
    }

    const retained = audit.retainedFromPrevious || [];
    const issues = audit.issues || [];

    const criticalRetained = retained.filter((municipality) => guardedMunicipalities.has(municipality));
    if (criticalRetained.length > 0) {
        fail(`重要自治体が前回値保持中です: ${criticalRetained.join(', ')}`);
    }

    const criticalIssues = issues.filter((issue) => {
        if (!guardedMunicipalities.has(issue.municipality)) return false;
        if (issue.level === 'error') return true;
        return /403|forbidden|保持/.test(issue.message.toLowerCase());
    });
    if (criticalIssues.length > 0) {
        const messages = criticalIssues.map((issue) => `${issue.municipality}: ${issue.message}`);
        fail(`重要自治体に収集エラーがあります: ${messages.join(' | ')}`);
    }

    const watch = evaluateCriticalWatch(items);
    const failedWatchResults = [...watch.projectResults, ...watch.sourceResults]
        .filter((result) => result.status === 'missing' && result.severity === 'error');
    const warningWatchResults = [...watch.projectResults, ...watch.sourceResults]
        .filter((result) => result.status === 'missing' && result.severity === 'warning');

    warningWatchResults.forEach((result) => {
        console.warn(`[quality] watch warning: ${result.message}`);
    });

    if (failedWatchResults.length > 0) {
        fail(`重要案件ウォッチで不足があります: ${failedWatchResults.map((result) => result.message).join(' | ')}`);
    }

    console.log('[quality] validation passed');
}

main();

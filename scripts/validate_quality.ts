import fs from 'fs';
import path from 'path';
import type { QualitySummary } from '../src/lib/quality_summary';
import { evaluateCriticalWatch, type CriticalWatchResult } from '../src/lib/critical_watch';
import { evaluateSourceCoverage, type SourceCoverageSummary } from '../src/lib/source_coverage';
import type { BiddingItem } from '../src/types/bidding';

const QUALITY_PATH = path.join(process.cwd(), 'scraper_quality.json');
const RESULT_PATH = path.join(process.cwd(), 'scraper_result.json');
const WATCH_REPORT_PATH = path.join(process.cwd(), 'quality_watch_report.json');

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

function compactItem(item: BiddingItem) {
    return {
        id: item.id,
        municipality: item.municipality,
        title: item.title,
        status: item.status,
        announcementDate: item.announcementDate,
        biddingDate: item.biddingDate || null,
        winningContractor: item.winningContractor || null,
        link: item.link,
        pdfUrl: item.pdfUrl || null,
    };
}

function writeWatchReport(
    summary: QualitySummary,
    items: BiddingItem[],
    watch: CriticalWatchResult,
    sourceCoverage: SourceCoverageSummary,
) {
    const report = {
        generatedAt: new Date().toISOString(),
        qualityGeneratedAt: summary.generatedAt || null,
        itemCount: items.length,
        criticalWatch: {
            activeCount: watch.activeCount,
            okCount: watch.okCount,
            missingErrorCount: watch.missingErrorCount,
            missingWarningCount: watch.missingWarningCount,
            projects: watch.projectResults.map((result) => ({
                id: result.watch.id,
                label: result.watch.label,
                municipality: result.watch.municipality || null,
                status: result.status,
                severity: result.severity,
                matchCount: result.matches.length,
                fieldIssues: result.fieldIssues,
                message: result.message,
                matches: result.matches.slice(0, 10).map(compactItem),
            })),
            sources: watch.sourceResults.map((result) => ({
                id: result.watch.id,
                label: result.watch.label,
                municipality: result.watch.municipality || null,
                status: result.status,
                severity: result.severity,
                count: result.count,
                requiredLinkIncludes: result.watch.linkIncludes,
                message: result.message,
                matches: result.matches.slice(0, 10).map(compactItem),
            })),
        },
        sourceCoverage: {
            activeCount: sourceCoverage.activeCount,
            okCount: sourceCoverage.okCount,
            missingErrorCount: sourceCoverage.missingErrorCount,
            missingWarningCount: sourceCoverage.missingWarningCount,
            results: sourceCoverage.results.map((result) => ({
                municipality: result.expectation.municipality,
                status: result.status,
                severity: result.severity,
                totalCount: result.totalCount,
                requiredLinkIncludes: result.expectation.requiredLinkIncludes,
                missingLinkIncludes: result.missingLinkIncludes,
                sourceCounts: result.sourceCounts,
                message: result.message,
            })),
        },
    };

    fs.writeFileSync(WATCH_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
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
    const sourceCoverage = evaluateSourceCoverage(items);
    writeWatchReport(summary, items, watch, sourceCoverage);

    const failedWatchResults = [...watch.projectResults, ...watch.sourceResults]
        .filter((result) => result.status === 'missing' && result.severity === 'error');
    const warningWatchResults = [...watch.projectResults, ...watch.sourceResults]
        .filter((result) => result.status === 'missing' && result.severity === 'warning');

    warningWatchResults.forEach((result) => {
        console.warn(`[quality] watch warning: ${result.message}`);
    });

    const failedSourceCoverage = sourceCoverage.results
        .filter((result) => result.status === 'missing' && result.severity === 'error');
    const warningSourceCoverage = sourceCoverage.results
        .filter((result) => result.status === 'missing' && result.severity === 'warning');

    warningSourceCoverage.forEach((result) => {
        console.warn(`[quality] source coverage warning: ${result.message}`);
    });

    if (failedWatchResults.length > 0) {
        fail(`重要案件ウォッチで不足があります: ${failedWatchResults.map((result) => result.message).join(' | ')}`);
    }

    if (failedSourceCoverage.length > 0) {
        fail(`自治体ソース監視で不足があります: ${failedSourceCoverage.map((result) => result.message).join(' | ')}`);
    }

    console.log('[quality] validation passed');
    console.log(`[quality] watch report written: ${path.basename(WATCH_REPORT_PATH)}`);
}

main();

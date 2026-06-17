import type { BiddingItem, Municipality } from '@/types/bidding';
import sourceCoverageConfig from '../../config/municipality_source_coverage.json';

export type CoverageSeverity = 'error' | 'warning';
export type CoverageStatus = 'ok' | 'missing';

export type MunicipalitySourceExpectation = {
  municipality: Municipality;
  minItems?: number;
  requiredLinkIncludes: string[];
  severity?: CoverageSeverity;
};

export type SourceCoverageConfig = {
  municipalities: MunicipalitySourceExpectation[];
};

export type MunicipalitySourceCoverageResult = {
  expectation: MunicipalitySourceExpectation;
  status: CoverageStatus;
  severity: CoverageSeverity;
  totalCount: number;
  missingLinkIncludes: string[];
  sourceCounts: Record<string, number>;
  message: string;
};

export type SourceCoverageSummary = {
  activeCount: number;
  okCount: number;
  missingErrorCount: number;
  missingWarningCount: number;
  results: MunicipalitySourceCoverageResult[];
};

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

function severityOf(value?: CoverageSeverity): CoverageSeverity {
  return value === 'warning' ? 'warning' : 'error';
}

function itemLinkText(item: BiddingItem): string {
  return [item.link || '', item.pdfUrl || ''].join(' ');
}

function includesSource(item: BiddingItem, sourceNeedle: string): boolean {
  return normalize(itemLinkText(item)).includes(normalize(sourceNeedle));
}

function countSourceMatches(items: BiddingItem[], sourceNeedle: string): number {
  return items.filter((item) => includesSource(item, sourceNeedle)).length;
}

export function getSourceCoverageConfig(): SourceCoverageConfig {
  return sourceCoverageConfig as SourceCoverageConfig;
}

export function evaluateSourceCoverage(
  items: BiddingItem[],
  config: SourceCoverageConfig = getSourceCoverageConfig(),
): SourceCoverageSummary {
  const results = config.municipalities.map<MunicipalitySourceCoverageResult>((expectation) => {
    const municipalityItems = items.filter((item) => item.municipality === expectation.municipality);
    const minItems = expectation.minItems ?? 1;
    const sourceCounts = Object.fromEntries(
      expectation.requiredLinkIncludes.map((sourceNeedle) => [
        sourceNeedle,
        countSourceMatches(municipalityItems, sourceNeedle),
      ]),
    );
    const missingLinkIncludes = expectation.requiredLinkIncludes
      .filter((sourceNeedle) => sourceCounts[sourceNeedle] < 1);
    const hasEnoughItems = municipalityItems.length >= minItems;
    const status: CoverageStatus = hasEnoughItems && missingLinkIncludes.length === 0 ? 'ok' : 'missing';
    const severity = severityOf(expectation.severity);

    return {
      expectation,
      status,
      severity,
      totalCount: municipalityItems.length,
      missingLinkIncludes,
      sourceCounts,
      message: status === 'ok'
        ? `${expectation.municipality}: ${municipalityItems.length}件 / sources OK`
        : `${expectation.municipality}: ${municipalityItems.length}件、missing sources: ${missingLinkIncludes.join(', ') || 'none'}`,
    };
  });

  const missingResults = results.filter((result) => result.status === 'missing');

  return {
    activeCount: results.length,
    okCount: results.filter((result) => result.status === 'ok').length,
    missingErrorCount: missingResults.filter((result) => result.severity === 'error').length,
    missingWarningCount: missingResults.filter((result) => result.severity === 'warning').length,
    results,
  };
}

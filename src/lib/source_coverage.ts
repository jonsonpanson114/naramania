import type { BiddingItem, Municipality } from '@/types/bidding';
import sourceCoverageConfig from '../../config/municipality_source_coverage.json';

export type CoverageSeverity = 'error' | 'warning';
export type CoverageStatus = 'ok' | 'missing';

export type MunicipalitySourceExpectation = {
  municipality: Municipality;
  minItems?: number;
  requiredLinkIncludes: string[];
  severity?: CoverageSeverity;
  /**
   * 公告側(まだ結果が出ていない案件)の最低件数。
   * 「結果ページしか見ていない」状態を検知するための指標。
   */
  minAnnouncements?: number;
  /**
   * 結果側(落札・不調)の最低件数。
   * 「公告しか見ていない」状態を検知するための指標。
   */
  minResults?: number;
  /** 設定の意図を書き残すためのメモ（判定には使わない） */
  note?: string;
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
  /** 公告側(結果未確定)の件数 */
  announcementCount: number;
  /** 結果側(落札・不調)の件数 */
  resultCount: number;
  /** 公告・結果のどちらかが不足しているか */
  missingPhases: ('announcement' | 'result')[];
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

function isResultItem(item: BiddingItem): boolean {
  // 落札者名が手入力の補足データにだけ入っているケースを「結果を取得できている」と
  // 数えてしまうと、結果ページを見ていない自治体の警告が消えてしまう。
  // 開札済みステータスが確定しているものだけを結果として数える。
  return item.status === '落札' || item.status === '不調';
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
    const allowsEmptyAfterFiltering = minItems === 0 && municipalityItems.length === 0;

    const resultCount = municipalityItems.filter(isResultItem).length;
    const announcementCount = municipalityItems.length - resultCount;
    const missingPhases: ('announcement' | 'result')[] = [];
    if (!allowsEmptyAfterFiltering) {
      if (announcementCount < (expectation.minAnnouncements ?? 0)) missingPhases.push('announcement');
      if (resultCount < (expectation.minResults ?? 0)) missingPhases.push('result');
    }

    const status: CoverageStatus =
      allowsEmptyAfterFiltering
      || (hasEnoughItems && missingLinkIncludes.length === 0 && missingPhases.length === 0)
        ? 'ok'
        : 'missing';
    const severity = severityOf(expectation.severity);

    const phaseLabel = missingPhases
      .map((phase) => (phase === 'announcement' ? '公告(受付中)が0件' : '入札結果(落札)が0件'))
      .join(', ');

    return {
      expectation,
      status,
      severity,
      totalCount: municipalityItems.length,
      missingLinkIncludes,
      sourceCounts,
      announcementCount,
      resultCount,
      missingPhases,
      message: allowsEmptyAfterFiltering
        ? `${expectation.municipality}: 対象案件なし / filtered scope OK`
        : status === 'ok'
        ? `${expectation.municipality}: ${municipalityItems.length}件 (公告${announcementCount}/結果${resultCount}) / sources OK`
        : `${expectation.municipality}: ${municipalityItems.length}件 (公告${announcementCount}/結果${resultCount})`
          + `${missingLinkIncludes.length > 0 ? `、missing sources: ${missingLinkIncludes.join(', ')}` : ''}`
          + `${phaseLabel ? `、${phaseLabel}` : ''}`,
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

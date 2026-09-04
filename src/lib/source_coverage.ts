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
   * ここでは公告・結果の最低件数を設定できるようにしない。
   * この関数が受け取るのは建築フィルタ通過後の案件なので、
   * 「公告ページを見ていない」と「公告は取れているが今回は全部土木だった」を
   * 区別できず、恒久的な誤警告になる（大和高田市はEPIから公告86件・結果80件を
   * 取得できているのに、全件が土木で除外されフィルタ後は公告0/結果0に見える）。
   * 公告・結果の取りこぼし監視は、フィルタ前の件数で判定する
   * scripts/audit_live_sources.ts の buildPhaseWarnings が担当する。
   */
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

    // 公告・結果の件数は状況把握のためレポートに載せるだけで、判定には使わない。
    // 理由は MunicipalitySourceExpectation のコメントを参照。
    const resultCount = municipalityItems.filter(isResultItem).length;
    const announcementCount = municipalityItems.length - resultCount;

    const status: CoverageStatus =
      allowsEmptyAfterFiltering
      || (hasEnoughItems && missingLinkIncludes.length === 0)
        ? 'ok'
        : 'missing';
    const severity = severityOf(expectation.severity);

    return {
      expectation,
      status,
      severity,
      totalCount: municipalityItems.length,
      missingLinkIncludes,
      sourceCounts,
      announcementCount,
      resultCount,
      message: allowsEmptyAfterFiltering
        ? `${expectation.municipality}: 対象案件なし / filtered scope OK`
        : status === 'ok'
        ? `${expectation.municipality}: ${municipalityItems.length}件 (公告${announcementCount}/結果${resultCount}) / sources OK`
        : `${expectation.municipality}: ${municipalityItems.length}件 (公告${announcementCount}/結果${resultCount})`
          + `${missingLinkIncludes.length > 0 ? `、missing sources: ${missingLinkIncludes.join(', ')}` : ''}`,
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

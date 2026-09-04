import fs from 'fs';
import path from 'path';
import { NaraPrefScraper } from '../src/scrapers/nara_pref';
import { NaraCityScraper } from '../src/scrapers/nara_city';
import { KashiharaCityScraper } from '../src/scrapers/kashihara_city';
import { IkomaCityScraper } from '../src/scrapers/ikoma_city';
import { YamatoTakadaCityScraper } from '../src/scrapers/yamato_takada_city';
import { YamatokoriyamaCityScraper } from '../src/scrapers/yamatokoriyama_city';
import { KatsuragiCityScraper } from '../src/scrapers/katsuragi_city';
import { GojoCityScraper } from '../src/scrapers/gojo_city';
import { GoseCityScraper } from '../src/scrapers/gose_city';
import { TenriCityScraper } from '../src/scrapers/tenri_city';
import { SakuraiCityScraper } from '../src/scrapers/sakurai_city';
import { UdaCityScraper } from '../src/scrapers/uda_city';
import { TawaramotoTownScraper } from '../src/scrapers/tawaramoto_town';
import { KoryoTownScraper } from '../src/scrapers/koryo_town';
import { KashibaCityScraper } from '../src/scrapers/kashiba_city';
import { KawanishiCityScraper } from '../src/scrapers/kawanishi_city';
import { MiyakeCityScraper } from '../src/scrapers/miyake_city';
import { YamazomuraScraper, HiragawaScraper } from '../src/scrapers/yamazohiragawa_city';
import { AndoCityScraper } from '../src/scrapers/ando_city';
import { TakatoriTownScraper, IkarugaTownScraper } from '../src/scrapers/takatori_ikaruga';
import { SangoTownScraper } from '../src/scrapers/sango_town';
import { OjiTownScraper } from '../src/scrapers/oji_town';
import { OyodoTownScraper } from '../src/scrapers/oyodo_town';
import type { BiddingItem, Scraper } from '../src/types/bidding';
import { shouldKeepBiddingItem } from '../src/scrapers/common/filter';
import { evaluateSnapshotCoverage, type MunicipalitySnapshots } from '../src/lib/snapshot_coverage';

const RESULT_PATH = path.join(process.cwd(), 'scraper_result.json');
const REPORT_PATH = path.join(process.cwd(), 'live_source_audit_report.json');

type ScraperAuditResult = {
  municipality: BiddingItem['municipality'];
  rawCount: number;
  keptCount: number;
  rejectedCount: number;
  /** 掲載対象のうち公告側(結果未確定)の件数 */
  keptAnnouncementCount: number;
  /** 掲載対象のうち結果側(落札・不調)の件数 */
  keptResultCount: number;
  errors: string[];
  warnings: string[];
};

function isResultItem(item: BiddingItem): boolean {
  // 落札者名が手入力の補足データにだけ入っているケースを「結果を取得できている」と
  // 数えてしまうと、結果ページを見ていない自治体の警告が消えてしまう。
  // 開札済みステータスが確定しているものだけを結果として数える。
  return item.status === '落札' || item.status === '不調';
}

/**
 * 公告・結果のどちらか一方しか取れていない自治体を警告する。
 * 「結果ページしか見ていない」「公告しか見ていない」状態は
 * スクレイパーが動いているように見えるので、件数だけでは気づけない。
 *
 * 判定はフィルタ前(rawItems)で行う。このサイトは建築案件だけを残すため、
 * フィルタ後の件数で数えると「公告ページを見ていない」と
 * 「公告は取れているが今回は全部土木だった」を区別できない。
 * 実際、大和高田市はEPIから公告86件・結果80件を取得できているのに
 * 全件が土木で除外され、フィルタ後では公告0/結果0に見えていた。
 */
function buildPhaseWarnings(municipality: string, rawItems: BiddingItem[]): string[] {
  if (rawItems.length === 0) return [];
  const resultCount = rawItems.filter(isResultItem).length;
  const announcementCount = rawItems.length - resultCount;

  if (announcementCount === 0) {
    return [`${municipality}: 取得${rawItems.length}件がすべて開札済みです。入札公告(入札情報)ページを見落としていないか確認が必要です。`];
  }
  if (resultCount === 0) {
    return [`${municipality}: 取得${rawItems.length}件に落札結果が1件もありません。入札結果(開札情報)ページを見落としていないか確認が必要です。`];
  }
  return [];
}

type FilteredScrapers = {
  selected: Scraper[];
  onlyMunicipalities: string[];
  excludedMunicipalities: string[];
};

function parseMunicipalityEnvList(value?: string): Set<string> {
  if (!value) return new Set();
  return new Set(value.split(/[,\n]/).map((entry) => entry.trim()).filter(Boolean));
}

// 一時的なネットワーク障害（相手サイトの過負荷・瞬断）を表すエラーは
// 監査を失敗させず警告に格下げする。24自治体を毎回巡回すると
// どこか1つは高確率で503やタイムアウトを返すため。
const TRANSIENT_ERROR_PATTERNS = [
  /\b(429|500|502|503|504)\b/,
  /status code (429|500|502|503|504)/i,
  /ETIMEDOUT/i,
  /ECONNRESET/i,
  /ECONNABORTED/i,
  /ECONNREFUSED/i,
  /EAI_AGAIN/i,
  /ENOTFOUND/i,
  /socket hang up/i,
  /timeout/i,
  /Navigation timeout/i,
  /net::ERR_/i,
];

function isTransientError(message: string): boolean {
  return TRANSIENT_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

// 診断メッセージを「恒久的なエラー（要調査）」と「一時的な警告」に振り分ける
function partitionScraperMessages(messages: string[]): { errors: string[]; transient: string[] } {
  const errors: string[] = [];
  const transient: string[] = [];
  for (const message of messages) {
    if (isTransientError(message)) {
      transient.push(`一時的な取得失敗（次回再試行）: ${message}`);
    } else {
      errors.push(message);
    }
  }
  return { errors, transient };
}

function createScrapers(): Scraper[] {
  return [
    new NaraPrefScraper(),
    new NaraCityScraper(),
    new KashiharaCityScraper(),
    new IkomaCityScraper(),
    new YamatoTakadaCityScraper(),
    new YamatokoriyamaCityScraper(),
    new KatsuragiCityScraper(),
    new GojoCityScraper(),
    new GoseCityScraper(),
    new TenriCityScraper(),
    new SakuraiCityScraper(),
    new UdaCityScraper(),
    new TawaramotoTownScraper(),
    new KoryoTownScraper(),
    new KashibaCityScraper(),
    new KawanishiCityScraper(),
    new YamazomuraScraper(),
    new HiragawaScraper(),
    new MiyakeCityScraper(),
    new AndoCityScraper(),
    new TakatoriTownScraper(),
    new IkarugaTownScraper(),
    new SangoTownScraper(),
    new OjiTownScraper(),
    new OyodoTownScraper(),
  ];
}

function loadCurrentItems(): BiddingItem[] {
  if (!fs.existsSync(RESULT_PATH)) {
    throw new Error('scraper_result.json が見つかりません');
  }
  return JSON.parse(fs.readFileSync(RESULT_PATH, 'utf-8')) as BiddingItem[];
}

function filterScrapers(scrapers: Scraper[]): FilteredScrapers {
  const only = parseMunicipalityEnvList(process.env.LIVE_AUDIT_ONLY_MUNICIPALITIES || process.env.SCRAPE_ONLY_MUNICIPALITIES);
  const except = parseMunicipalityEnvList(process.env.LIVE_AUDIT_EXCEPT_MUNICIPALITIES || process.env.SCRAPE_EXCEPT_MUNICIPALITIES);
  const selected = scrapers.filter((scraper) => {
    if (only.size > 0 && !only.has(scraper.municipality)) return false;
    if (except.has(scraper.municipality)) return false;
    return true;
  });

  const selectedMunicipalities = new Set(selected.map((scraper) => scraper.municipality));
  const excludedMunicipalities = scrapers
    .map((scraper) => scraper.municipality)
    .filter((municipality) => !selectedMunicipalities.has(municipality));

  return {
    selected,
    onlyMunicipalities: Array.from(only),
    excludedMunicipalities,
  };
}

async function main() {
  const currentItems = loadCurrentItems();
  const scraperFilter = filterScrapers(createScrapers());
  const scrapers = scraperFilter.selected;
  if (scrapers.length === 0) {
    throw new Error('監査対象の scraper がありません');
  }

  console.log(`[live-audit] 対象自治体: ${scrapers.map((scraper) => scraper.municipality).join(', ')}`);
  if (scraperFilter.excludedMunicipalities.length > 0) {
    console.log(`[live-audit] 除外自治体: ${scraperFilter.excludedMunicipalities.join(', ')}`);
  }

  const liveSnapshots: MunicipalitySnapshots = {};
  const scraperResults: ScraperAuditResult[] = [];

  for (const scraper of scrapers) {
    console.log(`\n[live-audit] ${scraper.municipality} 開始`);
    try {
      const rawItems = await scraper.scrape();
      const diagnostics = scraper.getDiagnostics?.();
      const keptItems = rawItems.filter((item) => shouldKeepBiddingItem(item));
      const currentMunicipalityCount = currentItems.filter((item) => item.municipality === scraper.municipality).length;
      const zeroCoverageWarnings = rawItems.length === 0 && currentMunicipalityCount === 0
        ? [`${scraper.municipality}: ライブ取得0件かつDB掲載0件です。対象案件なしなのか、取得失敗なのか確認が必要です。`]
        : [];
      liveSnapshots[scraper.municipality] = rawItems;
      const { errors: genuineErrors, transient } = partitionScraperMessages(diagnostics?.errors || []);
      const keptResultCount = keptItems.filter(isResultItem).length;
      const keptAnnouncementCount = keptItems.length - keptResultCount;
      const phaseWarnings = buildPhaseWarnings(scraper.municipality, rawItems);
      scraperResults.push({
        municipality: scraper.municipality,
        rawCount: rawItems.length,
        keptCount: keptItems.length,
        rejectedCount: rawItems.length - keptItems.length,
        keptAnnouncementCount,
        keptResultCount,
        warnings: [...(diagnostics?.warnings || []), ...transient, ...zeroCoverageWarnings, ...phaseWarnings],
        errors: genuineErrors,
      });
      phaseWarnings.forEach((warning) => console.warn(`[live-audit] ${warning}`));
      console.log(`[live-audit] ${scraper.municipality}: raw=${rawItems.length} keep=${keptItems.length} (公告${keptAnnouncementCount}/結果${keptResultCount})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      liveSnapshots[scraper.municipality] = [];
      const transient = isTransientError(message);
      scraperResults.push({
        municipality: scraper.municipality,
        rawCount: 0,
        keptCount: 0,
        rejectedCount: 0,
        keptAnnouncementCount: 0,
        keptResultCount: 0,
        warnings: transient ? [`一時的な取得失敗（次回再試行）: ${message}`] : [],
        errors: transient ? [] : [message],
      });
      console.error(`[live-audit] ${scraper.municipality}: ${transient ? '一時エラー（警告扱い）' : 'エラー'}: ${message}`);
    }
  }

  const coverage = evaluateSnapshotCoverage(currentItems, liveSnapshots);
  // scraperErrorCount は「恒久的な障害」だけを数える。一時的エラーは warnings 側。
  const scraperErrorCount = scraperResults.reduce((sum, result) => sum + result.errors.length, 0);
  const transientWarningCount = scraperResults.reduce(
    (sum, result) => sum + result.warnings.filter((w) => w.startsWith('一時的な取得失敗')).length,
    0,
  );
  const report = {
    generatedAt: new Date().toISOString(),
    currentItemCount: currentItems.length,
    checkedMunicipalities: scrapers.map((scraper) => scraper.municipality),
    onlyMunicipalities: scraperFilter.onlyMunicipalities,
    excludedMunicipalities: scraperFilter.excludedMunicipalities,
    scraperErrorCount,
    transientWarningCount,
    scraperResults,
    coverage,
  };

  if (transientWarningCount > 0) {
    console.warn(`[live-audit] 一時的な取得失敗 ${transientWarningCount}件（警告扱い・監査は継続）`);
  }

  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

  if (scraperErrorCount > 0 && process.env.LIVE_AUDIT_ALLOW_SCRAPER_ERRORS !== '1') {
    const samples = scraperResults
      .filter((result) => result.errors.length > 0)
      .slice(0, 5)
      .map((result) => `${result.municipality}: ${result.errors[0]}`)
      .join(' | ');
    console.error(`[live-audit] report written: ${path.basename(REPORT_PATH)}`);
    throw new Error(`公開サイト監査でスクレイパーエラーがあります: ${samples}`);
  }

  if (coverage.missingItemCount > 0) {
    const samples = coverage.results
      .flatMap((result) => result.missingItems)
      .slice(0, 8)
      .map((item) => `${item.municipality}: ${item.title}`)
      .join(' | ');
    console.error(`[live-audit] report written: ${path.basename(REPORT_PATH)}`);
    throw new Error(`公開サイトにはあるがDBにない必要案件があります: ${samples}`);
  }

  console.log(`[live-audit] validation passed (${coverage.matchedItemCount}/${coverage.expectedItemCount} live required items)`);
  console.log(`[live-audit] report written: ${path.basename(REPORT_PATH)}`);
}

main().catch((error) => {
  console.error(`[live-audit] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

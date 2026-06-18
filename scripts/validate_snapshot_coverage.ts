import fs from 'fs';
import path from 'path';
import type { BiddingItem } from '../src/types/bidding';
import { evaluateSnapshotCoverage, type MunicipalitySnapshots } from '../src/lib/snapshot_coverage';

const RESULT_PATH = path.join(process.cwd(), 'scraper_result.json');
const SNAPSHOT_PATH = path.join(process.cwd(), 'municipality_snapshots.json');
const REPORT_PATH = path.join(process.cwd(), 'snapshot_coverage_report.json');

function fail(message: string): never {
  console.error(`[snapshot-coverage] ${message}`);
  process.exit(1);
}

function loadItems(): BiddingItem[] {
  if (!fs.existsSync(RESULT_PATH)) fail('scraper_result.json が見つかりません');
  return JSON.parse(fs.readFileSync(RESULT_PATH, 'utf-8')) as BiddingItem[];
}

function loadSnapshots(): MunicipalitySnapshots {
  if (!fs.existsSync(SNAPSHOT_PATH)) fail('municipality_snapshots.json が見つかりません');
  return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8')) as MunicipalitySnapshots;
}

function main() {
  const items = loadItems();
  const snapshots = loadSnapshots();
  const summary = evaluateSnapshotCoverage(items, snapshots);
  const report = {
    generatedAt: new Date().toISOString(),
    ...summary,
  };

  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

  if (summary.missingItemCount > 0) {
    const samples = summary.results
      .flatMap((result) => result.missingItems)
      .slice(0, 5)
      .map((item) => `${item.municipality}: ${item.title}`)
      .join(' | ');
    fail(`スナップショットにはあるが掲載DBにない必要案件があります: ${samples}`);
  }

  console.log(`[snapshot-coverage] validation passed (${summary.matchedItemCount}/${summary.expectedItemCount} expected snapshot items)`);
  console.log(`[snapshot-coverage] report written: ${path.basename(REPORT_PATH)}`);
}

main();

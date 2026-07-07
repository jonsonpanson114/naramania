import fs from 'fs';
import { buildDateAuditSummary, buildIntelligenceSummary, readQualitySummary, writeQualitySummary } from '../../src/lib/quality_summary';
import { evaluateSourceCoverage } from '../../src/lib/source_coverage';
import type { BiddingItem } from '../../src/types/bidding';

const items: BiddingItem[] = JSON.parse(fs.readFileSync('scraper_result.json', 'utf8'));
const prev = readQualitySummary();
if (!prev) throw new Error('quality summary not found');

const counts: Record<string, number> = {};
for (const item of items) counts[item.municipality] = (counts[item.municipality] || 0) + 1;
const breakdown = Object.entries(counts)
  .map(([municipality, count]) => ({ municipality, count }))
  .sort((a, b) => b.count - a.count);

writeQualitySummary({
  ...prev,
  keptCount: items.length,
  municipalityCount: Object.keys(counts).length,
  municipalityAudit: prev.municipalityAudit ? { ...prev.municipalityAudit, breakdown } : undefined,
  dateAudit: buildDateAuditSummary(items),
  sourceCoverage: evaluateSourceCoverage(items),
  intelligence: buildIntelligenceSummary(items, prev.intelligence?.lastAugmentedAt),
});
console.log('quality summary rebuilt. items:', items.length);

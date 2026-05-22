import fs from 'fs';
import path from 'path';

const MUNICIPALITIES = [
    '奈良県', '奈良市', '橿原市', '生駒市', '大和高田市', '大和郡山市',
    '葛城市', '五條市', '御所市', '天理市', '桜井市', '宇陀市', '田原本町',
    '広陵町', '香芝市', '川西町', '三宅町', '山添村', '平群町', '安堵町',
    '高取町', '斑鳩町', '三郷町', '王寺町', '大淀町',
] as const;

type AuditRow = {
    municipality: string;
    count: number;
    latestAnnouncementDate: string | null;
    scraperFile: string | null;
    riskFlags: string[];
};

function findScraperFile(municipality: string): string | null {
    const scraperDir = path.join(process.cwd(), 'src', 'scrapers');
    const files = fs.readdirSync(scraperDir).filter(file => file.endsWith('.ts'));
    for (const file of files) {
        const content = fs.readFileSync(path.join(scraperDir, file), 'utf8');
        if (content.includes(`municipality: '${municipality}'`)) {
            return path.join('src', 'scrapers', file).replace(/\\/g, '/');
        }
    }
    return null;
}

function collectRiskFlags(filePath: string | null): string[] {
    if (!filePath) return ['scraper_not_found'];
    const absPath = path.join(process.cwd(), filePath);
    const content = fs.readFileSync(absPath, 'utf8');
    const flags: string[] = [];

    if (content.includes('Math.random')) flags.push('random_id');
    if (content.includes("return '2025-03-01'")) flags.push('hardcoded_date_fallback');
    if (content.includes('new Date().toISOString().split(\'T\')[0]')) flags.push('today_fallback');
    if (content.includes('2025-') || content.includes('2026-')) flags.push('hardcoded_year_logic');
    if (content.includes('NaraPrefScraper') && !filePath.endsWith('nara_pref.ts')) flags.push('delegates_to_other_scraper');
    if (content.includes('rss.xml')) flags.push('rss_only');

    return flags;
}

function main() {
    const resultPath = path.join(process.cwd(), 'scraper_result.json');
    const outputPath = path.join(process.cwd(), 'coverage_audit.json');
    const items = JSON.parse(fs.readFileSync(resultPath, 'utf8')) as Array<{ municipality: string; announcementDate: string }>;

    const rows: AuditRow[] = MUNICIPALITIES.map((municipality) => {
        const mine = items.filter(item => item.municipality === municipality);
        const latestAnnouncementDate = mine.length
            ? mine.map(item => item.announcementDate).sort().at(-1) || null
            : null;
        const scraperFile = findScraperFile(municipality);
        return {
            municipality,
            count: mine.length,
            latestAnnouncementDate,
            scraperFile,
            riskFlags: collectRiskFlags(scraperFile),
        };
    });

    const summary = {
        generatedAt: new Date().toISOString(),
        municipalitiesWithData: rows.filter(row => row.count > 0).length,
        municipalitiesWithoutData: rows.filter(row => row.count === 0).length,
        rows,
    };

    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), 'utf8');
    console.log(JSON.stringify(summary, null, 2));
}

main();

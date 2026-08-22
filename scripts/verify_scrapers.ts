/**
 * 変更したスクレイパーを実際に走らせて、CIと同じ検証に通るかを確認する。
 *
 * 【なぜ必要か】
 * validate_quality.ts などはディスク上の scraper_result.json を読む。スクレイパーの
 * .ts だけを変更してデータを再生成せずに検証しても、古い(正常な)データを見るだけで
 * 必ず通ってしまう。実際、20市町村の内部プレフィルタを撤去した際にこの穴を踏み、
 * 山添村の広報記事が「落札なのに開札日なし」で混入していることに気づけないまま
 * pushし、Daily Scrapeが2日間commitできなくなった。
 *
 * このスクリプトは「対象自治体を実際にスクレイプ → 検証 → データを元に戻す」まで
 * 一括で行う。データファイルは検証後に必ず git checkout で復元するため、
 * 実行してもワーキングツリーは汚れない。
 *
 * 使い方:
 *   npm run verify:scrapers -- 山添村,大淀町
 *   npm run verify:scrapers            # 変更されたスクレイパーから自治体を自動判定
 */
import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/** スクレイパーのファイル名 → 生成する自治体名 */
const SCRAPER_MUNICIPALITIES: Record<string, string[]> = {
    'ando_city.ts': ['安堵町'],
    'gojo_city.ts': ['五條市'],
    'gose_city.ts': ['御所市'],
    'ikoma_city.ts': ['生駒市'],
    'kashiba_city.ts': ['香芝市'],
    'kashihara_city.ts': ['橿原市'],
    'katsuragi_city.ts': ['葛城市'],
    'kawanishi_city.ts': ['川西町'],
    'koryo_town.ts': ['広陵町'],
    'miyake_city.ts': ['三宅町'],
    'nara_city.ts': ['奈良市'],
    'nara_pref.ts': ['奈良県'],
    'oji_town.ts': ['王寺町'],
    'oyodo_town.ts': ['大淀町'],
    'sakurai_city.ts': ['桜井市'],
    'sango_town.ts': ['三郷町'],
    'takatori_ikaruga.ts': ['斑鳩町', '高取町'],
    'tawaramoto_town.ts': ['田原本町'],
    'tenri_city.ts': ['天理市'],
    'uda_city.ts': ['宇陀市'],
    'yamato_takada_city.ts': ['大和高田市'],
    'yamatokoriyama_city.ts': ['大和郡山市'],
    'yamazohiragawa_city.ts': ['山添村', '平群町'],
};

/** スクレイプで書き換わるデータファイル。検証後に必ず元へ戻す */
const DATA_FILES = [
    'scraper_result.json',
    'scraper_quality.json',
    'municipality_snapshots.json',
    'quality_watch_report.json',
    'snapshot_coverage_report.json',
    'opening_result_updates.json',
    'rejected_items_report.json',
    'market_items.json',
];

function log(message: string): void {
    console.log(`[verify:scrapers] ${message}`);
}

/** 共通フィルタなど、全自治体に影響するファイル */
function isGlobalFilterFile(file: string): boolean {
    return file === 'src/scrapers/common/filter.ts'
        || file === 'config/data_filters.json'
        || file.startsWith('src/lib/practical_filters')
        || file.startsWith('src/lib/relevance_guard');
}

function detectChangedMunicipalities(): { municipalities: string[]; global: boolean } {
    let changed: string[] = [];
    try {
        // origin/main と比べて、まだpushしていない変更を拾う
        const base = execSync('git merge-base HEAD origin/main', { encoding: 'utf-8' }).trim();
        changed = execSync(`git diff --name-only ${base} HEAD`, { encoding: 'utf-8' })
            .split('\n').map(s => s.trim()).filter(Boolean);
    } catch {
        log('origin/main と比較できなかったため、未コミットの変更を対象にします');
        changed = execSync('git diff --name-only HEAD', { encoding: 'utf-8' })
            .split('\n').map(s => s.trim()).filter(Boolean);
    }

    if (changed.some(isGlobalFilterFile)) {
        return { municipalities: [], global: true };
    }

    const municipalities = new Set<string>();
    for (const file of changed) {
        if (!file.startsWith('src/scrapers/')) continue;
        const base = path.basename(file);
        for (const name of SCRAPER_MUNICIPALITIES[base] ?? []) municipalities.add(name);
    }
    return { municipalities: Array.from(municipalities), global: false };
}

function restoreDataFiles(): void {
    const existing = DATA_FILES.filter(f => fs.existsSync(path.join(process.cwd(), f)));
    if (existing.length === 0) return;
    try {
        execFileSync('git', ['checkout', '--', ...existing], { stdio: 'ignore' });
        log('データファイルを元に戻しました');
    } catch {
        console.warn('[verify:scrapers] データファイルの復元に失敗しました。git status を確認してください');
    }
}

function run(command: string, env?: NodeJS.ProcessEnv): void {
    execSync(command, { stdio: 'inherit', env: { ...process.env, ...env } });
}

function main(): void {
    const arg = process.argv.slice(2).join(',').trim();
    let targets: string[];

    if (arg) {
        targets = arg.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    } else {
        const detected = detectChangedMunicipalities();
        if (detected.global) {
            log('共通フィルタが変更されています。全自治体を対象にします（時間がかかります）');
            targets = [];
        } else if (detected.municipalities.length === 0) {
            log('スクレイパーの変更が見つかりませんでした。検証をスキップします');
            return;
        } else {
            targets = detected.municipalities;
        }
    }

    log(targets.length > 0 ? `対象自治体: ${targets.join(', ')}` : '対象: 全自治体');

    let failed = false;
    try {
        run('npm run scrape', targets.length > 0
            ? { SCRAPE_ONLY_MUNICIPALITIES: targets.join(',') }
            : undefined);

        // CIのDaily Scrapeと同じ検証を、生成し直したデータに対して行う
        run('npm run validate:quality');
        run('npm run validate:filters');
        run('npm run validate:snapshots');
        log('すべての検証に通りました');
    } catch {
        failed = true;
    } finally {
        restoreDataFiles();
    }

    if (failed) {
        console.error('[verify:scrapers] 検証に失敗しました。修正してから push してください');
        process.exit(1);
    }
}

main();

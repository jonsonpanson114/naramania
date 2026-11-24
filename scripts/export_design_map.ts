/**
 * 設計案件マップ（src/data/design_map.ts）を design_map.json に書き出す。
 * 営業支援アプリが raw.githubusercontent から読むための写し。
 *
 *   npm run export:design-map     … 書き出す
 *   npm run validate:design-map   … 写しが古くないか確かめる（CI で使う）
 *
 * design_map.ts を書き換えたら、必ず export:design-map も実行してコミットすること。
 * 忘れると CI が落ちる（営業支援に古い内容が出続けるのを防ぐため）。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    MAP_TITLE, OPEN_BIDS, FORECAST_NOTE, FORECAST_ROWS, BIG_PROJECTS,
    PROPO_LEAD, PROPO_ROWS, YEAR_LEAD, YEAR_ITEMS
} from '../src/data/design_map';

const OUT = resolve(__dirname, '..', 'design_map.json');

function build(): string {
    const asOf = MAP_TITLE.meta.find(m => m.k === '調査日')?.v ?? '';
    const data = {
        source: 'src/data/design_map.ts',
        asOf,
        openBids: OPEN_BIDS,
        forecastNote: FORECAST_NOTE,
        forecastRows: FORECAST_ROWS,
        bigProjects: BIG_PROJECTS,
        propoLead: PROPO_LEAD,
        propoRows: PROPO_ROWS,
        yearLead: YEAR_LEAD,
        yearItems: YEAR_ITEMS
    };
    return JSON.stringify(data, null, 2) + '\n';
}

const next = build();
if (process.argv.includes('--check')) {
    const current = existsSync(OUT) ? readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
    if (current !== next) {
        console.error('design_map.json が design_map.ts と合っていません。npm run export:design-map を実行してコミットしてください。');
        process.exit(1);
    }
    console.log('design_map.json は最新です。');
} else {
    writeFileSync(OUT, next, 'utf8');
    console.log('design_map.json を書き出しました。');
}

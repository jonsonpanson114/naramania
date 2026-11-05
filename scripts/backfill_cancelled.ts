/**
 * 「不調」のうち、発注元の表示が中止・取止めの案件に cancelled を付ける一度きりの処理。
 * 奈良県は確定済みの案件を再取得しないので、収集を回すだけでは過去分に印が付かない。
 * 奈良市の「不調」は結果一覧の開札日欄が取止め・中止の行だけなので、そのまま印を付ける。
 */
import fs from 'fs';
import path from 'path';
import type { BiddingItem } from '../src/types/bidding';

const FILES = ['scraper_result.json', 'market_items.json'].map(name => path.join(process.cwd(), name));
const prefCancelled = new Map<string, boolean>();

async function isPrefCancelled(link: string): Promise<boolean> {
    const known = prefCancelled.get(link);
    if (known !== undefined) return known;
    const response = await fetch(link, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${link}`);
    const html = new TextDecoder('shift_jis').decode(await response.arrayBuffer());
    const cancelled = html.includes('【中止】');
    prefCancelled.set(link, cancelled);
    return cancelled;
}

async function main() {
    for (const file of FILES) {
        const items = JSON.parse(fs.readFileSync(file, 'utf8')) as BiddingItem[];
        let marked = 0;
        for (const item of items) {
            if (item.status !== '不調' || item.cancelled) continue;
            const cancelled = item.municipality === '奈良市'
                || (item.municipality === '奈良県' && item.link.includes('kanriNo=') && await isPrefCancelled(item.link));
            if (cancelled) {
                item.cancelled = true;
                marked += 1;
            }
        }
        fs.writeFileSync(file, JSON.stringify(items, null, 2) + '\n');
        console.log(`${path.basename(file)}: ${marked}件に中止の印を付けました`);
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});

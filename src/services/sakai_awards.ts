import { chromium, type Browser, type Page } from 'playwright';
import { parseReiwaSlash } from './osaka_pref_awards';

/**
 * 堺市の入札・契約結果(コンサル)から、建築設計・設備設計の落札者を読む。
 *
 * 堺市は奈良市と同じ efftis で、一覧に落札者名がそのまま出る(住所は出ない)。
 * 奈良の事務所かどうかは、名前を奈良の設計事務所の名簿と照らして判定する。
 */

export const SAKAI_PPI_URL = 'https://sakai.efftis.jp/ebid01/PPI/Public/PPUBC00100';

/** 業種の選択肢の値。建築設計業務と設備設計業務 */
const DESIGN_GYOSHU = ['005000', '006000'];

export interface SakaiResult {
    id: string;
    title: string;
    kind: string;
    openDate: string;
    /** 「保留」「取止め」など、落札者が決まっていないときは空 */
    winner?: string;
    amount?: string;
    checkedAt: string;
}

/** 「令和8年09月24日」「R08/09/24」「2026/09/24」のどれでも日付にする */
export function parseSakaiDate(text: string): string {
    const normalized = text.normalize('NFKC');
    const reiwa = normalized.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (reiwa) return `${2018 + Number(reiwa[1])}-${reiwa[2].padStart(2, '0')}-${reiwa[3].padStart(2, '0')}`;
    const western = normalized.match(/(20\d{2})[/-](\d{1,2})[/-](\d{1,2})/);
    if (western) return `${western[1]}-${western[2].padStart(2, '0')}-${western[3].padStart(2, '0')}`;
    return parseReiwaSlash(normalized);
}

/** 落札者の欄の「保留」「取止め」「不調」は、落札者が決まっていないことを表す */
export function sakaiWinner(text: string): string | undefined {
    const name = text.replace(/\s+/g, ' ').trim();
    if (!name || /^(保留|取止め|取り止め|中止|不調|不落|辞退|-|－)$/.test(name)) return undefined;
    return name;
}

type RawRow = { id: string; title: string; kind: string; winner: string; openDate: string; amount: string };

/** 一覧は1件が2行(1行目に案件、2行目に開札日と落札金額) */
const READ_ROWS = `(() => {
    const rows = [...document.querySelectorAll('#meibo_list tr')];
    const out = [];
    for (let i = 0; i < rows.length; i += 1) {
        const cells = [...rows[i].children];
        const id = cells[0] ? cells[0].innerText.trim() : '';
        if (!/^\\d{8,}$/.test(id)) continue;
        const next = rows[i + 1] ? [...rows[i + 1].children] : [];
        const text = cell => (cell ? cell.innerText.replace(/\\s+/g, ' ').trim() : '');
        out.push({
            id,
            title: text(cells[1]),
            kind: text(cells[3]),
            winner: text(cells[5]),
            openDate: text(next[0]),
            amount: text(next[1]),
        });
    }
    return out;
})()`;

const PAGE_RANGE = `(() => {
    const match = document.body.innerText.match(/全?(\\d+)件中\\s*(\\d+)\\s*-\\s*(\\d+)件目/);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : [0, 0, 0];
})()`;

async function readAllPages(page: Page): Promise<RawRow[]> {
    const rows: RawRow[] = [];
    for (let guard = 0; guard < 20; guard += 1) {
        rows.push(...await page.evaluate(READ_ROWS) as RawRow[]);
        const [total, , end] = await page.evaluate(PAGE_RANGE) as number[];
        if (!total || end >= total) break;
        // next() は送信のあとに戻るボタンを書き換えようとして失敗するが、ページ送り自体は済んでいる
        // 渡す値はページごとに変わるので、画面の「次へ」に書かれた呼び出しをそのまま使う
        const onclick = (await page.locator('img.next').first().getAttribute('onclick')) ?? "next('0')";
        await page.evaluate(onclick.replace(/return\s+false;?/, '')).catch(() => undefined);
        // 次のページの範囲表示に変わるまで待つ(切り替わる前の一覧を読み直さない)
        let moved = false;
        for (let i = 0; i < 40 && !moved; i += 1) {
            await page.waitForTimeout(500);
            const [, start] = await page.evaluate(PAGE_RANGE).catch(() => [0, 0, 0]) as number[];
            moved = start > end;
        }
        if (!moved) throw new Error(`堺市の入札結果: ${end}件目の次のページに進めない`);
        // 読み込みの途中で次の送りを掛けると取り消されるので、読み終わるのを待つ
        await page.waitForLoadState('load');
        await page.waitForTimeout(1000);
    }
    return rows;
}

function fiscalYear(date: Date): number {
    return date.getMonth() + 1 >= 4 ? date.getFullYear() : date.getFullYear() - 1;
}

export async function collectSakaiDesignResults(now: Date = new Date()): Promise<SakaiResult[]> {
    const results = new Map<string, SakaiResult>();
    let browser: Browser | null = null;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        page.setDefaultTimeout(30000);
        // 年度の初めは前年度の結果もまだ新しいので、今年度と前年度を見る
        const years = [fiscalYear(now), fiscalYear(now) - 1];
        for (const year of years) {
            for (const gyoshu of DESIGN_GYOSHU) {
                await page.goto(SAKAI_PPI_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
                await page.evaluate("execLink100('PPUBC00700', '01')");
                await page.waitForURL(/PPUBC00700/);
                await page.selectOption('select[name="kensakuJoken.selNendo"]', String(year)).catch(() => undefined);
                await page.selectOption('select[name="kensakuJoken.selGyoshu"]', gyoshu);
                await page.selectOption('select[name="kensakuJoken.selHyojiKensu"]', '50');
                await Promise.all([page.waitForURL(/PPUBC00800/), page.locator('input[value="検　索"]').click()]);
                await page.waitForLoadState('domcontentloaded');
                const [total] = await page.evaluate(PAGE_RANGE) as number[];
                if (!total) continue;
                const rows = await readAllPages(page);
                console.log(`[sakai] ${year}年度 業種${gyoshu}: ${total}件中 ${rows.length}件を読んだ`);
                for (const row of rows) {
                    results.set(row.id, {
                        id: row.id,
                        title: row.title,
                        kind: row.kind,
                        openDate: parseSakaiDate(row.openDate),
                        winner: sakaiWinner(row.winner),
                        amount: row.amount || undefined,
                        checkedAt: now.toISOString(),
                    });
                }
                await page.waitForTimeout(1000);
            }
        }
    } finally {
        await browser?.close().catch(() => undefined);
    }
    return Array.from(results.values());
}

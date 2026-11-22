import { chromium, type Browser } from 'playwright';

/**
 * 大阪市の調達・契約システム(2026年7月からの新システム)の「業者決定済案件」から、
 * 建築設計・設備設計の落札者を読む。
 *
 * 一覧には契約の相手方の名前が出る(住所は出ない)ので、奈良の設計事務所の名簿と照らして判定する。
 * 一覧は開札日の新しい順に最大1,000件(物品や工事も含めて約2か月分)が出る。
 */

export const OSAKA_CITY_RESULTS_URL = 'https://www.osaka.city.beneproc.com/#/anken-list/supplier-decided?page=0&pageSize=1000&sortId=bid_open_at__c&sortDesc=true';

export interface OsakaCityResult {
    id: string;
    title: string;
    kind: string;
    openDate: string;
    winner?: string;
    amount?: string;
    checkedAt: string;
}

/** 種目の欄で、建築の設計・監理の案件を見分ける */
const DESIGN_KIND = /建築設計|設備設計/;

const READ_TABLE = `(() => {
    const head = [...document.querySelectorAll('table thead th')]
        .map(cell => cell.innerText.replace(/Sort/g, '').replace(/\\s+/g, ''));
    const rows = [...document.querySelectorAll('table tbody tr')]
        .map(row => [...row.children].map(cell => cell.innerText.replace(/\\s+/g, ' ').trim()));
    return { head, rows };
})()`;

/** 見出しの名前で列を探す。列の並びが変わっても読めるようにする */
function column(head: string[], pattern: RegExp): number {
    return head.findIndex(name => pattern.test(name));
}

export function parseOsakaCityTable(head: string[], rows: string[][], checkedAt: string): OsakaCityResult[] {
    const idCol = column(head, /^案件番号$/);
    const typeCol = column(head, /^調達種別$/);
    const titleCol = column(head, /^案件名$/);
    const kindCols = [column(head, /^種目$/), column(head, /種目1|種目１/), column(head, /種目2|種目２/), column(head, /種目3|種目３/)]
        .filter(index => index >= 0);
    const openCol = column(head, /^開札日$/);
    const amountCol = column(head, /落札金額/);
    const winnerCol = column(head, /^契約者または契約の相手方$/);
    if ([idCol, typeCol, titleCol, openCol, winnerCol].some(index => index < 0)) {
        throw new Error(`大阪市の入札結果: 表の見出しが変わった (${head.join(',')})`);
    }

    return rows
        .filter(row => /コンサル/.test(row[typeCol] ?? ''))
        .map(row => ({ row, kind: kindCols.map(index => row[index] ?? '').filter(text => text && text !== '-').join(' / ') }))
        .filter(({ kind }) => DESIGN_KIND.test(kind))
        .map(({ row, kind }) => ({
            id: row[idCol],
            title: row[titleCol],
            kind,
            openDate: (row[openCol] ?? '').replace(/\//g, '-'),
            winner: row[winnerCol] && row[winnerCol] !== '-' ? row[winnerCol] : undefined,
            amount: row[amountCol] || undefined,
            checkedAt,
        }));
}

export async function collectOsakaCityDesignResults(now: Date = new Date()): Promise<OsakaCityResult[]> {
    let browser: Browser | null = null;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(OSAKA_CITY_RESULTS_URL, { waitUntil: 'networkidle', timeout: 90000 });
        // 画面は読み込んだあとに表を組み立てるので、行が出るまで待つ
        for (let i = 0; i < 60; i += 1) {
            const count = Number(await page.evaluate("document.querySelectorAll('table tbody tr').length"));
            if (count > 0) break;
            await page.waitForTimeout(1000);
        }
        await page.waitForTimeout(2000);
        const { head, rows } = await page.evaluate(READ_TABLE) as { head: string[]; rows: string[][] };
        if (rows.length === 0) throw new Error('大阪市の入札結果: 一覧が空だった');
        return parseOsakaCityTable(head, rows, now.toISOString());
    } finally {
        await browser?.close().catch(() => undefined);
    }
}

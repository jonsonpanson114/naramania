import { chromium, type Browser, type Frame, type Page } from 'playwright';

/**
 * 大阪府の入札結果(電子調達システム)から、建築設計・設備設計の落札者と住所を読む。
 *
 * 府の結果の詳細には落札者の住所が載るので、名簿に頼らず「住所が奈良」で奈良の事務所を見分けられる。
 * 検索結果も詳細も別ウィンドウで開く作りなので、同じ枠に出すよう書き換えて読む。
 */

export const OSAKA_PREF_RESULTS_URL = 'https://www.e-nyusatsu.pref.osaka.jp/CALS/Publish/EbController?Shori=KekkaInfo';

export interface OsakaPrefResult {
    id: string;
    title: string;
    kind: string;
    location: string;
    openDate: string;
    /** 落札者が決まっていない(確認中・中止など)ときは空 */
    winner?: string;
    address?: string;
    amount?: string;
    decided: boolean;
    checkedAt: string;
}

/** 建築の設計・監理の案件。土木のコンサルタント業務は営業先ではないので読まない */
const DESIGN_KIND = /建築設計|設備設計/;

const NARA_ADDRESS = new RegExp(`^(?:奈良県|${[
    '奈良市', '大和高田市', '大和郡山市', '天理市', '橿原市', '桜井市', '五條市', '御所市', '生駒市', '香芝市',
    '葛城市', '宇陀市', '山辺郡', '生駒郡', '磯城郡', '宇陀郡', '高市郡', '北葛城郡', '吉野郡',
].join('|')})`);

/** 住所の書き方は「奈良県」から始まるものと、市町村名から始まるものがある */
export function isNaraAddress(address?: string): boolean {
    return NARA_ADDRESS.test((address ?? '').normalize('NFKC').replace(/\s/g, ''));
}

/** 「R08/11/10」を「2026-11-10」にする */
export function parseReiwaSlash(text: string): string {
    const match = text.normalize('NFKC').match(/R(\d{1,2})\/(\d{1,2})\/(\d{1,2})/);
    if (!match) return '';
    const year = 2018 + Number(match[1]);
    return `${year}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

const DETAIL_LABELS = ['落札企業住所', '落札金額', '入札書比較予定価格', '予定価格算出基礎額', '入札結果', '備考'];

/** 詳細画面の文から、項目名の次の行を値として読む。値が空なら次の項目名が来る */
function valueAfter(lines: string[], label: string): string {
    // 「入札結果情報」の見出しと取り違えないよう、項目名は行全体で比べる
    const index = lines.findIndex(line => line === label);
    if (index < 0) return '';
    const next = lines[index + 1]?.trim() ?? '';
    return DETAIL_LABELS.some(other => next.startsWith(other)) ? '' : next;
}

export function parseResultDetail(text: string): Pick<OsakaPrefResult, 'winner' | 'address' | 'amount' | 'decided'> {
    const lines = text.split('\n').map(line => line.replace(/[ \t　]+/g, ' ').trim()).filter(Boolean);
    const nameIndex = lines.findIndex(line => line.startsWith('（落札企業体名称）') || line.startsWith('(落札企業体名称)'));
    const nameLine = nameIndex >= 0 ? lines[nameIndex + 1] ?? '' : '';
    const winner = nameLine && !nameLine.startsWith('落札企業住所') ? nameLine : '';
    const status = valueAfter(lines, '入札結果');
    return {
        winner: winner || undefined,
        address: valueAfter(lines, '落札企業住所') || undefined,
        amount: valueAfter(lines, '落札金額') || undefined,
        decided: Boolean(winner) && /落札者決定|契約/.test(status || '落札者決定'),
    };
}

/** 結果を別ウィンドウではなく同じ枠に出す */
const SAME_FRAME = `(() => {
    window.openSubWindow = () => {};
    window.commandFormObj = null;
    for (const form of document.forms) form.target = '_self';
})()`;

/** 一覧の先頭行の番号。ページ送りが済んだかを確かめるのに使う */
const FIRST_ROW_NO = `(() => {
    const rows = [...document.querySelectorAll('table tr')].filter(row => row.children.length >= 10);
    return rows.length > 1 ? Number(rows[1].children[0].innerText.trim()) : 0;
})()`;

/**
 * 画面が切り替わるのを待つ。文字だけで判定すると、切り替わる前の古い一覧を読んでしまう
 * (ページ送りのたびに1ページ目を読み直していた)ので、一覧は先頭行の番号まで確かめる。
 */
async function waitForFrame(page: Page, pattern: RegExp, firstRowNo?: number): Promise<Frame> {
    for (let i = 0; i < 60; i += 1) {
        const frame = page.frames().find(candidate => candidate.name() === 'wpMain');
        if (frame) {
            const ready = await frame.evaluate('document.readyState === "complete" && Boolean(document.formRegist)').catch(() => false);
            const text = String(await frame.evaluate('document.body ? document.body.innerText : ""').catch(() => ''));
            const rowNo = firstRowNo ? Number(await frame.evaluate(FIRST_ROW_NO).catch(() => 0)) : 0;
            if (ready && pattern.test(text) && (!firstRowNo || rowNo === firstRowNo)) return frame;
        }
        await page.waitForTimeout(500);
    }
    throw new Error(`大阪府の入札結果: 画面が出ない (${pattern}${firstRowNo ? ` / ${firstRowNo}行目から` : ''})`);
}

type ListRow = { id: string; title: string; kind: string; location: string; openDate: string };

const READ_ROWS = `[...document.querySelectorAll('table tr')]
    .filter(row => row.children.length >= 10)
    .map(row => {
        const button = row.querySelector('input[onclick*=move_kekka]');
        const id = button ? (button.getAttribute('onclick').match(/'(\\d+)'/) || [])[1] : '';
        const cell = index => row.children[index].innerText.replace(/\\s+/g, ' ').trim();
        return { id, title: cell(2), kind: cell(4), location: cell(5), openDate: cell(7) };
    })`;

export interface CollectOptions {
    /** 落札者まで決まって読み終えた案件。開き直さない */
    finished: Set<string>;
    /** 開札日がこの日数より前の案件は見ない */
    lookbackDays?: number;
    /** 1回で開く詳細の上限 */
    maxDetails?: number;
    now?: Date;
}

export async function collectOsakaPrefDesignResults(options: CollectOptions): Promise<OsakaPrefResult[]> {
    const now = options.now ?? new Date();
    const oldest = new Date(now.getTime() - (options.lookbackDays ?? 60) * 86_400_000);
    const oldestKey = `${oldest.getFullYear()}-${String(oldest.getMonth() + 1).padStart(2, '0')}-${String(oldest.getDate()).padStart(2, '0')}`;
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const maxDetails = options.maxDetails ?? 40;
    const results: OsakaPrefResult[] = [];
    let browser: Browser | null = null;

    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        page.setDefaultTimeout(30000);
        await page.goto(OSAKA_PREF_RESULTS_URL, { waitUntil: 'load', timeout: 45000 });
        let frame = await waitForFrame(page, /検索条件入力/);
        await frame.check('input[name=keiyakuKbn][value="01"]');
        await frame.selectOption('select[name=showRange]', { index: 2 });
        await frame.evaluate(SAME_FRAME);
        await frame.evaluate('movePpiProjectList()');
        frame = await waitForFrame(page, /件が該当/, 1);
        const seen = new Set<string>();

        // 一覧は公告日の新しい順。見る期間より古い開札日だけになったページで止める
        for (let start = 1; start <= 1000 && results.length < maxDetails; start += 50) {
            if (start > 1) {
                await frame.evaluate(SAME_FRAME);
                await frame.evaluate(`searchIndex(${start})`);
                frame = await waitForFrame(page, /件が該当/, start);
            }
            const rows = (await frame.evaluate(READ_ROWS) as ListRow[])
                .map(row => ({ ...row, openDate: parseReiwaSlash(row.openDate) }));
            if (rows.length === 0) break;

            const targets = rows.filter(row => row.id && DESIGN_KIND.test(row.kind)
                && row.openDate && row.openDate >= oldestKey && row.openDate <= todayKey
                && !options.finished.has(row.id) && !seen.has(row.id));
            for (const row of targets) {
                if (results.length >= maxDetails) break;
                seen.add(row.id);
                await frame.evaluate(SAME_FRAME);
                await frame.evaluate(`move_kekka('${row.id}')`);
                const detail = await waitForFrame(page, /落札企業名称/);
                const text = String(await detail.evaluate('document.body.innerText'));
                results.push({ ...row, ...parseResultDetail(text), checkedAt: now.toISOString() });
                await detail.evaluate('history.back()');
                frame = await waitForFrame(page, /件が該当/, start);
                await page.waitForTimeout(800);
            }

            if (rows.every(row => !row.openDate || row.openDate < oldestKey)) break;
        }
    } finally {
        await browser?.close().catch(() => undefined);
    }

    return results;
}

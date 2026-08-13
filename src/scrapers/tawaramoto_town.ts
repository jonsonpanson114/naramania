import { chromium } from 'playwright';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
// 田原本町の入札情報サービス（EffTis PPI）
const EFFTIS_BASE = 'https://tawaramoto.efftis.jp/PPI/Public';
const EFFTIS_TOP = `${EFFTIS_BASE}/PPUBC00100`;

const SEARCH_TARGETS = [
    { screenId: 'PPUBC00400', chotatsu_kbn: '00', status: '受付中' as const, label: '建設工事/入札公告' },
    { screenId: 'PPUBC00700', chotatsu_kbn: '00', status: '落札' as const, label: '建設工事/入札結果' },
    { screenId: 'PPUBC00400', chotatsu_kbn: '01', status: '受付中' as const, label: '委託業務/入札公告' },
    { screenId: 'PPUBC00700', chotatsu_kbn: '01', status: '落札' as const, label: '委託業務/入札結果' },
];

function parseJapaneseDate(text: string): string {
    const m = text.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (m) {
        const year = 2018 + parseInt(m[1]);
        return `${year}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }
    return '';
}

function getTodayIsoInTokyo(): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
}

function classifyType(koushu: string, chotatsu: string): BiddingType {
    if (chotatsu === '01') return '委託';
    if (koushu.includes('建築')) return '建築';
    if (koushu.includes('設計') || koushu.includes('測量') || koushu.includes('コンサル')) return 'コンサル';
    return '建築';
}

export class TawaramotoTownScraper implements Scraper {
    municipality: '田原本町' = '田原本町' as const;

    async scrape(): Promise<BiddingItem[]> {
        const browser = await chromium.launch({ headless: true });
        const allItems: BiddingItem[] = [];

        try {
            const page = await browser.newPage();

            // EffTis は Content-Type に Shift_JIS と宣言するが実態は UTF-8 → 強制上書き
            // route.fetch() がタイムアウト等で失敗すると、このコールバックの外側の
            // try/catch では捕捉できず未処理のPromise拒否としてプロセス全体を
            // クラッシュさせるため、必ず内部で catch して fallback に逃がす。
            await page.route('**/*', async (route) => {
                try {
                    const response = await route.fetch();
                    const headers = response.headers();
                    const contentType = headers['content-type'] || '';
                    if (contentType.includes('text/html')) {
                        const buffer = await response.body();
                        await route.fulfill({
                            response,
                            body: buffer,
                            headers: { ...headers, 'content-type': 'text/html; charset=utf-8' }
                        });
                    } else {
                        await route.fallback();
                    }
                } catch {
                    await route.fallback().catch(() => { });
                }
            });

            for (const { screenId, chotatsu_kbn, status, label } of SEARCH_TARGETS) {
                console.log(`[田原本町] ${label} 取得中...`);
                try {
                    await page.goto(EFFTIS_TOP, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await page.waitForTimeout(1000);

                    const searchUrl = `${EFFTIS_BASE}/PPUBC00100!link?screenId=${screenId}&chotatsu_kbn=${chotatsu_kbn}`;
                    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await page.waitForTimeout(1500);

                    await page.locator('select').last().selectOption('50').catch(() => { });
                    await page.waitForTimeout(500);

                    await page.locator('input[value="検\u3000索"]').click({ timeout: 15000 });
                    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => { });
                    await page.waitForTimeout(2000);

                    // 奈良市と同じテーブル構造：1案件=2〜3行
                    const rows = await page.locator('table tr').all();
                    console.log(`[田原本町] ${label}: テーブル行数 ${rows.length}`);

                    for (let i = 0; i < rows.length - 1; i++) {
                        const cells = await rows[i].locator('td').all();
                        if (cells.length !== 7) continue;

                        const contractNo = (await cells[0].innerText()).trim();
                        const title = (await cells[2].innerText()).trim();
                        const koushu = (await cells[3].innerText()).trim();
                        const cell5 = cells.length > 5 ? (await cells[5].innerText()).trim().replace(/\s+/g, ' ') : '';

                        if (!title || !contractNo || contractNo.includes('契約番号')) continue;
                        // 建築関連性の判定(shouldKeepItem)はここでは行わない。
                        // ここで弾くとフィルタ対象外の案件が index.ts に一切渡らず、
                        // market_items.json（全件一覧）に載らなくなる。関連性の判定は
                        // index.ts が shouldKeepBiddingItem で一元的に行う設計になっている。

                        // 公告は3行構造、結果は奈良市と同じ2行構造で返る。
                        const nextCells = await rows[i + 1].locator('td').all();
                        let annoDate = '';
                        let biddingDate: string | undefined;
                        let isCancelled = false;

                        if (nextCells.length === 1) {
                            if (i + 2 >= rows.length) continue;
                            const dateCells = await rows[i + 2].locator('td').all();
                            if (dateCells.length < 3) continue;

                            annoDate = parseJapaneseDate((await dateCells[2].innerText()).trim());
                            const bd = dateCells.length >= 4
                                ? parseJapaneseDate((await dateCells[3].innerText()).trim())
                                : '';
                            biddingDate = bd || undefined;
                        } else {
                            // 「取止め」の案件は開札日の位置に日付ではなく「取止め」という
                            // 状態文字列が入る。従来は日付が取れない行を丸ごとスキップしており、
                            // 取止め案件が結果一覧から完全に消えていた（奈良市と同じ不具合）。
                            const rawDateText = nextCells.length >= 2
                                ? (await nextCells[1].innerText()).trim()
                                : '';
                            const dateStr = parseJapaneseDate(rawDateText);
                            isCancelled = !dateStr && /取止め|中止/.test(rawDateText);
                            annoDate = dateStr || (isCancelled ? getTodayIsoInTokyo() : '');
                            biddingDate = dateStr || undefined;
                        }

                        if (!annoDate) continue;

                        // 件名リンクの href が実URLではなく "javaScript:void(0);" という
                        // JSポップアップ起動用の疑似リンクのことがある。素通りさせると
                        // EFFTIS_BASE + '/javaScript:void(0);' という壊れたリンクになるため、
                        // 実URLでなければ検索トップにフォールバックする。
                        const linkEl = cells[2].locator('a').first();
                        let link = EFFTIS_TOP;
                        try {
                            const href = await linkEl.getAttribute('href');
                            if (href && href.startsWith('http')) link = href;
                        } catch { }

                        allItems.push({
                            id: `tawaramoto-${contractNo}`,
                            municipality: '田原本町',
                            title,
                            type: classifyType(koushu, chotatsu_kbn),
                            announcementDate: annoDate,
                            biddingDate,
                            link,
                            status: isCancelled ? '不調' : status,
                            winningContractor: status === '落札' && !isCancelled && cell5 && !/入札|申請|終了|未公開|なし|－|-/.test(cell5)
                                ? cell5
                                : undefined,
                        });
                    }

                    console.log(`[田原本町] ${label}: ${allItems.length}件（累計）`);

                } catch (e: unknown) {
                    console.warn(`[田原本町] ${label} エラー:`, e instanceof Error ? e.message : String(e)?.split('\n')[0]);
                }
            }

        } catch (e: unknown) {
            console.error('[田原本町] スクレイパーエラー:', e instanceof Error ? e.message : String(e) || e);
        } finally {
            await browser.close();
        }

        console.log(`[田原本町] 合計 ${allItems.length} 件`);
        return allItems;
    }
}

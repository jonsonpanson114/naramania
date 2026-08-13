import { chromium } from 'playwright';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
import { classifyWinner } from './common/filter';
// 奈良市の入札情報公開システム（efftis）
const EFFTIS_BASE = 'https://nara.efftis.jp/PPI/Public';
const EFFTIS_TOP = `${EFFTIS_BASE}/PPUBC00100?kikanno=0201`;

// 検索対象ページ（直接URL + chotatsu_kbn）
const SEARCH_TARGETS = [
    { screenId: 'PPUBC00400', chotatsu_kbn: '00', status: '受付中' as const, label: '建設工事/入札公告' },
    { screenId: 'PPUBC00700', chotatsu_kbn: '00', status: '落札' as const, label: '建設工事/入札結果' },
    { screenId: 'PPUBC00400', chotatsu_kbn: '01', status: '受付中' as const, label: '業務委託/入札公告' },
    { screenId: 'PPUBC00700', chotatsu_kbn: '01', status: '落札' as const, label: '業務委託/入札結果' },
];

// 土木系工種をスキップ
const SKIP_KOUSHUS = ['土木一式', '舗装工事', '法面工事', '河川', '砂防', '造園工事', '水道施設', '管工事', 'さく井', '電気通信工事', '橋梁', '橋', '測量', '下水道'];

function shouldSkipKoushu(koushu: string): boolean {
    return SKIP_KOUSHUS.some(kw => koushu.includes(kw));
}

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
    if (koushu.includes('設計') || koushu.includes('測量') || koushu.includes('コンサル')) return 'コンサル';
    if (chotatsu === '01') return '委託'; // 業務委託カテゴリ
    if (koushu.includes('建築')) return '建築';
    return '建築';
}

export class NaraCityScraper implements Scraper {
    municipality: '奈良市' = '奈良市' as const;

    async scrape(): Promise<BiddingItem[]> {
        const browser = await chromium.launch({ headless: true });
        const allItems: BiddingItem[] = [];

        try {
            const page = await browser.newPage();

            // EFFTISサーバーはContent-TypeにShift_JISを指定しているが、実際の中身はUTF-8で送られてくる。
            // これによりChromiumがUTF-8をShift_JISとしてデコードしようとし、文字化け（Mojibake）が発生していた。
            // 対策: レスポンスを横取りし、文字コード宣言を強制的にUTF-8に書き換える。
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
                console.log(`[奈良市] ${label} 取得中...`);
                try {
                    // トップページでセッション確立
                    await page.goto(EFFTIS_TOP, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await page.waitForTimeout(1000);

                    // 検索画面に直接ナビゲート
                    const searchUrl = `${EFFTIS_BASE}/PPUBC00100!link?screenId=${screenId}&chotatsu_kbn=${chotatsu_kbn}`;
                    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await page.waitForTimeout(1500);

                    // 50件表示に切り替え
                    await page.locator('select').last().selectOption('50').catch(() => { });
                    await page.waitForTimeout(500);

                    // 検索ボタンクリック（全角スペース）
                    await page.locator('input[value="検\u3000索"]').click({ timeout: 15000 });
                    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => { });
                    await page.waitForTimeout(2000);

                    // テーブルの全行を取得
                    // 入札公告（受付中）: 1案件=3行 (主行7セル → 提出期限1セル → 電子|公告日|開札日 3セル)
                    // 入札結果（落札）:   1案件=2行 (主行7セル → 電子|開札日 2セル)
                    const rows = await page.locator('table tr').all();
                    console.log(`[奈良市] ${label}: テーブル行数 ${rows.length}`);

                    for (let i = 0; i < rows.length - 1; i++) {
                        const cells = await rows[i].locator('td').all();
                        if (cells.length !== 7) continue; // 主行のみ処理

                        const contractNo = (await cells[0].innerText()).trim();
                        const title = (await cells[2].innerText()).trim();
                        const koushu = (await cells[3].innerText()).trim();
                        const cell5 = cells.length > 5 ? (await cells[5].innerText()).trim() : '';

                        if (!title || !contractNo || contractNo.includes('契約番号')) continue;
                        if (shouldSkipKoushu(koushu)) continue;
                        // 建築関連性の判定(shouldKeepItem)はここでは行わない。
                        // ここで弾くとフィルタ対象外の案件が index.ts に一切渡らず、
                        // market_items.json（全件一覧）に載らなくなる。関連性の判定は
                        // index.ts が shouldKeepBiddingItem で一元的に行う設計になっている。

                        // i+1 行目の列数で構造を判定
                        const nextCells = await rows[i + 1].locator('td').all();
                        let annoDate: string;
                        let biddingDate: string | undefined;
                        let isCancelled = false;

                        if (nextCells.length === 1) {
                            // 3行構造（受付中）: i+2 が「電子|公告日|開札日」
                            const dateCells = i + 2 < rows.length
                                ? await rows[i + 2].locator('td').all()
                                : [];
                            const rawAnnoDate = dateCells.length >= 2
                                ? parseJapaneseDate((await dateCells[1].innerText()).trim())
                                : '';
                            if (!rawAnnoDate) continue; // 日付が取れない行はスキップ
                            annoDate = rawAnnoDate;
                            const bd = dateCells.length >= 3
                                ? parseJapaneseDate((await dateCells[2].innerText()).trim())
                                : '';
                            biddingDate = bd || undefined;
                        } else {
                            // 2行構造（落札）: i+1 が「電子|開札日」。
                            // 「取止め」の案件はこの開札日の位置に日付ではなく「取止め」という
                            // 状態文字列が入る。従来は日付が取れない行を丸ごとスキップしており、
                            // 取止め案件が結果一覧から完全に消えていた。
                            const rawDateText = nextCells.length >= 2
                                ? (await nextCells[1].innerText()).trim()
                                : '';
                            const dateStr = parseJapaneseDate(rawDateText);
                            isCancelled = !dateStr && /取止め|中止/.test(rawDateText);
                            if (!dateStr && !isCancelled) continue; // 日付も取止め表記もない行は構造不明としてスキップ
                            annoDate = dateStr || getTodayIsoInTokyo();
                            biddingDate = dateStr || undefined;
                        }

                        // 詳細リンク（件名列のa要素）。
                        // このシステムは件名リンクの href が実URLではなく "javaScript:void(0);"
                        // というJSポップアップ起動用の疑似リンクになっている。素通りさせると
                        // EFFTIS_BASE + '/javaScript:void(0);' という壊れたリンクが生成されるため、
                        // 実URLでなければ検索トップにフォールバックする。
                        const linkEl = cells[2].locator('a').first();
                        let link = EFFTIS_TOP;
                        try {
                            const href = await linkEl.getAttribute('href');
                            if (href && href.startsWith('http')) link = href;
                        } catch { }

                        const winningContractor = status === '落札' && !isCancelled && cell5 ? cell5 : undefined;
                        const itemStatus = isCancelled ? '不調' : status;

                        allItems.push({
                            id: `nara-city-${contractNo}`,
                            municipality: '奈良市',
                            title,
                            type: classifyType(koushu, chotatsu_kbn),
                            announcementDate: annoDate,
                            biddingDate,
                            link,
                            status: itemStatus,
                            winningContractor: winningContractor,
                            winnerType: classifyWinner(winningContractor || ''),
                        });
                    }

                    console.log(`[奈良市] ${label}: ${allItems.length}件（累計）`);

                } catch (e: unknown) {
                    console.warn(`[奈良市] ${label} エラー:`, e instanceof Error ? e.message : String(e)?.split('\n')[0]);
                }
            }

        } catch (e: unknown) {
            console.error('[奈良市] スクレイパーエラー:', e instanceof Error ? e.message : String(e) || e);
        } finally {
            await browser.close();
        }

        console.log(`[奈良市] 合計 ${allItems.length} 件`);
        return allItems;
    }
}

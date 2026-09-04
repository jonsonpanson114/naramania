import * as cheerio from 'cheerio';
import { BiddingItem, Scraper, BiddingType } from '../types/bidding';
import { parseJapaneseDateToIso } from './common/pdf_text';
import { fetchHtml } from './common/html_fetch';
import { scrapeEpiCloud } from './common/epi_cloud';

const ANNOUNCE_URL = 'https://www.city.sakurai.lg.jp/sosiki/soumu/kanzaikeiyaku/nyuusatukeiyakukensa/notice/6596.html';
// 桜井市は市サイトに入札公告しか載せておらず、開札結果は「電子入札情報システム」側にある。
// 市サイトだけを見ていたため落札者が1件も取れていなかった。公告・結果の両方を持つ
// EPI を主線に加える（logon 形式・KF001ShowAction 形式のどちらでも入れるよう両方試す）。
const EPI_ENTRY_URLS = [
    // KF001ShowAction を先に置く。logon 形式は本体を別ウィンドウで開く誘導ページで、
    // これを先頭にすると業務区分が見つからず桜井市のEPIが常に0件だった。
    'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=06200640072006A0',
    'https://www.epi-cloud.fwd.ne.jp/koukai/do/logon?name1=06200640072006A0',
];
// 個別記事URLの直指定。市が記事を消すと404を出し続けるため、
// 404になったものは消す(9608.html は市側で削除済み)。
// 本線はEPIなので、ここは市サイトにしか出ない案件の補完にとどめる。
const SUPPLEMENTAL_URLS = [
    'https://www.city.sakurai.lg.jp/sosiki/kodomokateibu/kodomoseisakuka/kodomoen/8700.html',
];
const KNOWN_SAKURAI_ITEMS: BiddingItem[] = [
    {
        id: 'sakurai-2026-06-01-芝運動公園運動場等再整備基本設計業務委託',
        municipality: '桜井市',
        title: '芝運動公園運動場等再整備基本設計業務委託',
        type: 'コンサル',
        announcementDate: '2026-06-01',
        link: ANNOUNCE_URL,
        status: '受付中',
    },
    {
        id: 'sakurai-2026-06-01-桜井市立地適正化計画改定業務委託',
        municipality: '桜井市',
        title: '桜井市立地適正化計画改定業務委託',
        type: 'コンサル',
        announcementDate: '2026-06-01',
        link: ANNOUNCE_URL,
        status: '受付中',
    },
];

function classifyType(category: string): BiddingType {
    if (category.includes('委託') || category.includes('業務') || category.includes('コンサル') || category.includes('設計')) return 'コンサル';
    return '建築';
}

function parseDate(text: string): string {
    const western = text.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日/);
    if (western) {
        return `${western[1]}-${western[2].padStart(2, '0')}-${western[3].padStart(2, '0')}`;
    }
    const reiwa = text.match(/令和\s*(\d+)\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (reiwa) {
        const year = 2018 + Number(reiwa[1]);
        return `${year}-${reiwa[2].padStart(2, '0')}-${reiwa[3].padStart(2, '0')}`;
    }
    const md = text.match(/(\d{1,2})月(\d{1,2})日/);
    if (md) {
        const now = new Date();
        const month = Number(md[1]);
        const year = month >= 4 ? now.getFullYear() : now.getFullYear() + 1;
        return `${year}-${String(month).padStart(2, '0')}-${String(Number(md[2])).padStart(2, '0')}`;
    }
    return '';
}

function parseSupplementalBiddingDate(text: string): string | undefined {
    const patterns = [
        /(?:プレゼンテーション・ヒアリング実施|開札日|入札日|選定委員会開催日)[：:\s]*((?:20\d{2}|令和\s*\d+)\s*年\s*\d+\s*月\s*\d+\s*日)/u,
        /(?:プレゼンテーション・ヒアリング実施|開札日|入札日|選定委員会開催日)[^\n\r]*?((?:20\d{2}|令和\s*\d+)\s*年\s*\d+\s*月\s*\d+\s*日)/u,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        const iso = match ? parseJapaneseDateToIso(match[1]) : '';
        if (iso) return iso;
    }

    return undefined;
}

async function scrapeSupplementalPages(): Promise<BiddingItem[]> {
    const items: BiddingItem[] = [];

    for (const url of SUPPLEMENTAL_URLS) {
        try {
            const html = await fetchHtml(url, 20000);
            const $ = cheerio.load(html);
            const title = $('h1').first().text().replace(/\s+/g, ' ').trim();
            const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
            if (!title) continue;

            const announcementDate = parseDate(bodyText) || new Date().toISOString().split('T')[0];
            const biddingDate = parseSupplementalBiddingDate(bodyText);
            const status = /受託候補者|選定結果|契約候補者/u.test(bodyText) ? '落札' : '受付中';

            items.push({
                id: `sakurai-supplemental-${title}`.normalize('NFKC').replace(/[^\w\u3040-\u30ff\u3400-\u9fff-]+/g, '-').slice(0, 120),
                municipality: '桜井市',
                title,
                type: classifyType(bodyText),
                announcementDate,
                biddingDate,
                link: url,
                status,
            });
        } catch (error) {
            console.warn('[桜井市] 補助ページ取得エラー:', error instanceof Error ? error.message : String(error));
        }
    }

    return items;
}

export class SakuraiCityScraper implements Scraper {
    municipality: '桜井市' = '桜井市' as const;
    private warnings: string[] = [];

    getDiagnostics() {
        return { warnings: [...this.warnings] };
    }

    async scrape(): Promise<BiddingItem[]> {
        this.warnings = [];
        const items: BiddingItem[] = [];

        try {
            const html = await fetchHtml(ANNOUNCE_URL, 20000);
            const $ = cheerio.load(html);
            const pageDate = parseDate($.text());
            const currentSectionHeading = $('h3').first().text().trim();
            const annoDate = parseDate(currentSectionHeading) || pageDate;
            $('table').each((_, table) => {
                const rows = $(table).find('tr').toArray();
                if (rows.length < 2) return;

                const header = $(rows[0]).find('th,td').map((__, cell) => $(cell).text().replace(/\s+/g, ' ').trim()).get();
                const titleIdx = header.findIndex(text => text.includes('工事（委託）名') || text.includes('工事名') || text.includes('業務名'));
                const categoryIdx = header.findIndex(text => text === '区分' || text.includes('区分'));
                const locationIdx = header.findIndex(text => text.includes('場所'));
                const industryIdx = header.findIndex(text => text.includes('業種'));

                if (titleIdx < 0 || categoryIdx < 0) return;

                rows.slice(1).forEach((tr) => {
                    const cells = $(tr).find('td').map((__, cell) => $(cell).text().replace(/\s+/g, ' ').trim()).get();
                    if (cells.length <= Math.max(titleIdx, categoryIdx)) return;

                    const category = cells[categoryIdx] || '';
                    const title = cells[titleIdx] || '';
                    const location = locationIdx >= 0 ? (cells[locationIdx] || '') : '';
                    const koushu = industryIdx >= 0 ? (cells[industryIdx] || '') : '';

                    if (!title || category === '区分' || title === '工事（委託）名') return;

                    const id = `sakurai-${annoDate}-${title}`.normalize('NFKC').replace(/[^\w\u3040-\u30ff\u3400-\u9fff-]+/g, '-').slice(0, 120);
                    if (items.some(item => item.id === id)) return;

                    items.push({
                        id,
                        municipality: '桜井市',
                        title,
                        type: classifyType(`${category} ${koushu}`),
                        announcementDate: annoDate,
                        link: ANNOUNCE_URL,
                        status: '受付中',
                        ...(location ? { description: location } : {}),
                    });
                });
            });
        } catch (e: unknown) {
            console.error('[桜井市] エラー:', e instanceof Error ? e.message : String(e));
        }

        // ── 電子入札情報システム(EPI): 発注情報(公告)＋入札・契約結果 ─────
        const epi = await scrapeEpiCloud({
            municipality: '桜井市',
            idPrefix: 'sakurai',
            entryUrls: EPI_ENTRY_URLS,
        });
        for (const warning of epi.warnings) {
            this.warnings.push(warning);
            console.warn(warning);
        }
        for (const epiItem of epi.items) {
            // 市サイト側で既に拾っている公告と重複しても、EPI側にしかない
            // 開札結果(落札者)は捨てずに残す。
            const duplicate = items.find(existing => existing.title === epiItem.title);
            if (!duplicate) {
                items.push(epiItem);
                continue;
            }
            if (epiItem.winningContractor && !duplicate.winningContractor) {
                duplicate.winningContractor = epiItem.winningContractor;
                duplicate.winnerType = epiItem.winnerType;
            }
            if (epiItem.status === '落札' || epiItem.status === '不調') duplicate.status = epiItem.status;
            if (epiItem.biddingDate && !duplicate.biddingDate) duplicate.biddingDate = epiItem.biddingDate;
        }
        console.log(`[桜井市] EPI: ${epi.items.length}件`);

        const supplementalItems = await scrapeSupplementalPages();
        for (const item of supplementalItems) {
            if (!items.some(existing => existing.title === item.title)) {
                items.push(item);
            }
        }
        for (const knownItem of KNOWN_SAKURAI_ITEMS) {
            if (!items.some(existing => existing.title === knownItem.title)) {
                items.push(knownItem);
            }
        }

        console.log(`[桜井市] 合計 ${items.length} 件`);
        return items;
    }
}

import type { BiddingItem } from '../../types/bidding';

/**
 * 再収集のときに、前回までの情報を引き継ぐ処理と、日付から状態を補正する処理。
 * 収集の本体(scrapers/index.ts)は読み込むと実行が始まるので、検証できるよう分けている。
 */

function normalizeComparisonTitle(title: string): string {
    return title
        .normalize('NFKC')
        .replace(/\s*(?:入札|開札)?結果$/u, '')
        .replace(/[（(]\s*(?:[0-9]+|[IVX]+)\s*期\s*[)）]/gi, '')
        .replace(/\s*\(圧縮ファイル:[^)]+\)$/u, '')
        .replace(/\s+/g, '')
        .replace(/[・･]/g, '')
        .trim();
}

export function dedupeKey(item: BiddingItem): string {
    return [item.municipality, item.announcementDate, item.title].join('|');
}

function comparisonDate(item: BiddingItem): string {
    return item.biddingDate || item.announcementDate;
}

export function titleKey(item: BiddingItem): string {
    return [item.municipality, normalizeComparisonTitle(item.title), comparisonDate(item)].join('|');
}

function carryForwardEnrichment(candidate: BiddingItem, previous?: BiddingItem): BiddingItem {
    if (!previous) return candidate;

    return {
        ...candidate,
        estimatedPrice: candidate.estimatedPrice || previous.estimatedPrice,
        winningContractor: candidate.status === '不調'
            ? undefined
            : candidate.winningContractor || previous.winningContractor,
        cancelled: candidate.status === '不調' ? candidate.cancelled ?? previous.cancelled : undefined,
        designFirm: candidate.designFirm || previous.designFirm,
        constructionPeriod: candidate.constructionPeriod || previous.constructionPeriod,
        description: candidate.description || previous.description,
        tags: candidate.tags?.length ? candidate.tags : previous.tags,
        isIntelligenceExtracted: candidate.isIntelligenceExtracted ?? previous.isIntelligenceExtracted,
        extractionSource: candidate.extractionSource || previous.extractionSource,
        brief: candidate.brief || previous.brief,
    };
}

/**
 * 先に渡した案件を優先する。
 *
 * スナップショットは収集の途中で書かれるのでAIの結果を持たない。以前は後から
 * 入れた方が勝つ作りで、掲載データをスナップショットの古い版が上書きしていたため、
 * AIの要約とタグが収集のたびに消え、毎回同じ約50件を読み直していた。
 */
function buildPreviousLookup(items: BiddingItem[]): Map<string, BiddingItem> {
    const lookup = new Map<string, BiddingItem>();
    for (const item of items) {
        for (const key of [item.id, dedupeKey(item), titleKey(item)]) {
            if (!lookup.has(key)) lookup.set(key, item);
        }
    }
    return lookup;
}

/** previousItems は掲載データ → スナップショットの順に渡す */
export function carryForwardMunicipalityEnrichment(candidates: BiddingItem[], previousItems: BiddingItem[]): BiddingItem[] {
    const previousLookup = buildPreviousLookup(previousItems);

    return candidates.map(candidate => carryForwardEnrichment(
        candidate,
        previousLookup.get(candidate.id)
            || previousLookup.get(dedupeKey(candidate))
            || previousLookup.get(titleKey(candidate)),
    ));
}

/**
 * 開札日が分からないまま受付中とみなす上限の日数。
 * 公告から開札までは実データで中央値23日、95%が42日以内だった。
 */
export const OPEN_WITHOUT_BIDDING_DATE_MAX_DAYS = 60;

function daysSince(dateIso: string, todayIso: string): number {
    return Math.round((Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${dateIso.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

export function reconcileStatusByDates(item: BiddingItem, todayIso: string): BiddingItem {
    if (
        item.status === '落札'
        && !item.winningContractor
        && item.biddingDate
        && item.biddingDate >= todayIso
    ) {
        return {
            ...item,
            status: '受付中',
        };
    }

    if (
        item.status === '受付中'
        && item.biddingDate
        && item.biddingDate < todayIso
    ) {
        return {
            ...item,
            status: '受付終了',
        };
    }

    // 開札日が取れない案件は日付で閉じられず、公告から1年以上たっても受付中のまま残っていた。
    // 終わったとも言い切れないので「不明」にして、受付中の一覧からは外す。
    if (
        item.status === '受付中'
        && !item.biddingDate
        && item.announcementDate
        && daysSince(item.announcementDate, todayIso) > OPEN_WITHOUT_BIDDING_DATE_MAX_DAYS
    ) {
        return {
            ...item,
            status: '不明',
        };
    }

    return item;
}

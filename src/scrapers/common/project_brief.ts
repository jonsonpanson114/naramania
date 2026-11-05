import type { BiddingItem, ProjectBriefRecord } from '../../types/bidding';

/**
 * 案件の中身(brief)の読み取り対象を選び、AIの答えを検証する。
 * ネットワークもAIも使わない部分だけをここに置いて、検証できるようにしている。
 */

/** 1回の実行で読む件数。AIの呼び出し回数と実行時間の上限になる */
export const BRIEF_BATCH_SIZE = 40;
/** 受付中で読めなかった案件を読み直すまでの日数。公告ページが後から更新されることがある */
export const BRIEF_RECHECK_DAYS = 7;

const GATED_SYSTEM = /epi-cloud\.fwd\.ne\.jp|efftis\.jp|ebid-kouji-gyoumu\.pref\.nara\.jp/;

export function isGatedLink(link?: string): boolean {
    return GATED_SYSTEM.test(link || '');
}

function isOpen(item: BiddingItem): boolean {
    return item.status === '受付中' || item.status === '締切間近' || item.status === '締切切迫';
}

/** 受付中を先に、残りは新しい案件から読む。URLだけで資料に届かない案件は読まない */
export function selectBriefTargets(items: BiddingItem[], now: Date, limit = BRIEF_BATCH_SIZE): BiddingItem[] {
    const recheckBefore = new Date(now.getTime() - BRIEF_RECHECK_DAYS * 86_400_000).toISOString();

    return items
        .filter(item => !isGatedLink(item.link) || Boolean(item.pdfUrl))
        .filter(item => !item.brief
            || (isOpen(item) && !item.brief.found && item.brief.checkedAt < recheckBefore))
        .sort((a, b) => {
            const rank = Number(isOpen(b)) - Number(isOpen(a));
            return rank || (b.announcementDate || '').localeCompare(a.announcementDate || '');
        })
        .slice(0, limit);
}

function normalize(text: string): string {
    return text.normalize('NFKC').replace(/[\s　・、。()（）「」【】]/g, '');
}

function cleanField(value?: string | null): string | undefined {
    const text = value?.trim();
    if (!text || text.length > 300) return undefined;
    return /^(null|none|なし|不明|記載なし|未定|該当なし|-|—)$/i.test(text) ? undefined : text;
}

type RawBrief = {
    found: boolean;
    summary?: string | null;
    location?: string | null;
    scale?: string | null;
    period?: string | null;
    price?: string | null;
    qualification?: string | null;
};

/**
 * AIの答えのうち、使えるものだけを残す。
 * 試し読みで、発注見通しの表の「2」「7」を工期として返すことがあった。
 */
export function sanitizeProjectBrief(title: string, raw: RawBrief | null, checkedAt: string): ProjectBriefRecord {
    if (!raw?.found) return { checkedAt, found: false };

    let summary = cleanField(raw.summary);
    // 案件名の言い換えは概要として意味が無い
    if (summary && (summary.length < 12 || normalize(title).includes(normalize(summary)))) summary = undefined;

    const period = cleanField(raw.period);
    const price = cleanField(raw.price);
    const fields = {
        summary,
        location: cleanField(raw.location),
        scale: cleanField(raw.scale),
        period: period && /[年月日]/.test(period) ? period : undefined,
        price: price && /[円¥￥]/.test(price) ? price : undefined,
        qualification: cleanField(raw.qualification),
    };

    const hasContent = Object.values(fields).some(Boolean);
    return { checkedAt, found: hasContent, ...(hasContent ? fields : {}) };
}

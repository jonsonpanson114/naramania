import type { NewsItem } from '@/services/news_service';

/**
 * 同じ話題の記事を1行にまとめる。
 * 見出しの言葉の重なりで判定する。「11月6日まで参加受付」のような定型句は
 * 別の案件でも一致するので、比べる前に外す。
 */

const TOPIC_WINDOW_DAYS = 3;
const TOPIC_THRESHOLD = 0.25;

function topicText(title: string): string {
    return title
        .normalize('NFKC')
        .replace(/\(\d{4}年\d+月\d+日掲載\)/g, '')
        .replace(/\d+年?\d*月\d+日(?:まで|に)?/g, '')
        .replace(/参加受付|開札|公告|入札|締結|決定|奈良県|奈良市|工事|業務/g, '')
        .replace(/[\s・/／、。「」『』()【】|｜:：-]/g, '');
}

function trigrams(title: string): Set<string> {
    const text = topicText(title);
    const grams = new Set<string>();
    for (let i = 0; i + 3 <= text.length; i += 1) grams.add(text.slice(i, i + 3));
    return grams;
}

function isSameTopic(a: Set<string>, b: Set<string>): boolean {
    if (a.size === 0 || b.size === 0) return false;
    let shared = 0;
    for (const gram of a) if (b.has(gram)) shared += 1;
    return shared / Math.min(a.size, b.size) >= TOPIC_THRESHOLD;
}

function daysApart(a: string, b: string): number {
    return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}

/** 渡された順を保ったまま、同じ話題を1つの配列にまとめる。先頭が一覧に出る記事 */
export function groupNewsByTopic<T extends NewsItem>(items: T[]): T[][] {
    const groups: { items: T[]; grams: Set<string>[] }[] = [];

    for (const item of items) {
        const grams = trigrams(item.title);
        const group = groups.find(candidate =>
            candidate.items.some((other, index) =>
                daysApart(other.date, item.date) <= TOPIC_WINDOW_DAYS && isSameTopic(candidate.grams[index], grams)));
        if (group) {
            group.items.push(item);
            group.grams.push(grams);
        } else {
            groups.push({ items: [item], grams: [grams] });
        }
    }

    // 一覧に出す記事は、業界紙など見出しに中身がある記事を優先する
    return groups.map(group => {
        const lead = group.items.find(item => item.source !== 'googlenews') ?? group.items[0];
        return [lead, ...group.items.filter(item => item !== lead)];
    });
}

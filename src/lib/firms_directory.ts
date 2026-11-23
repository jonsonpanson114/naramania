import type { BiddingItem } from '@/types/bidding';
import type { NewsItem } from '@/services/news_service';
import type { OsakaAwardRecord } from '@/lib/osaka_awards_store';
import { extractFirmNames, firmKey } from '@/lib/watched_firms';
import { loadWatchedFirms } from '@/lib/watched_firms_store';
import { evaluateSalesFit, type SalesFitLevel } from '@/lib/sales_fit';

export interface FirmTimelineEntry {
    id: string;
    area: '奈良' | '大阪' | 'ニュース';
    source: string;
    title: string;
    date: string;
    type?: string;
    amount?: string;
    status?: string;
    href: string;
    external: boolean;
    fitLevel: SalesFitLevel;
    fitLabel: string;
    isTarget: boolean;
}

export interface FirmProfile {
    key: string;
    name: string;
    naraCount: number;
    osakaCount: number;
    newsCount: number;
    targetCount: number;
    latestDate: string;
    entries: FirmTimelineEntry[];
}

function isDesignItem(item: BiddingItem): boolean {
    return item.type === 'コンサル' || item.type === '委託' || /設計|監理/.test(item.title);
}

export function buildFirmDirectory(
    allItems: BiddingItem[],
    osakaNaraAwards: OsakaAwardRecord[],
    newsItems: NewsItem[],
): FirmProfile[] {
    const watched = loadWatchedFirms();
    const map = new Map<string, FirmProfile>();

    const ensureProfile = (rawName: string): FirmProfile | null => {
        const key = firmKey(rawName);
        if (!key || key.length < 2) return null;
        let profile = map.get(key);
        if (!profile) {
            profile = {
                key,
                name: rawName,
                naraCount: 0,
                osakaCount: 0,
                newsCount: 0,
                targetCount: 0,
                latestDate: '',
                entries: [],
            };
            map.set(key, profile);
        }
        return profile;
    };

    // 名簿の設計事務所を先に登録しておく
    for (const firm of watched) {
        ensureProfile(firm.name);
    }

    // 1. 奈良の案件から設計事務所を紐づけ
    const outside = new Set<string>();
    for (const item of allItems) {
        const design = isDesignItem(item);
        const candidates: string[] = [];
        if (item.designFirm) {
            candidates.push(...extractFirmNames(item.designFirm, outside, false));
        }
        if (item.winningContractor) {
            candidates.push(...extractFirmNames(item.winningContractor, outside, !design));
        }

        const seenKeys = new Set<string>();
        const fit = evaluateSalesFit(item.title, item.description);
        const date = item.biddingDate || item.announcementDate || '';

        for (const name of candidates) {
            const key = firmKey(name);
            if (!key || seenKeys.has(key)) continue;
            seenKeys.add(key);

            const profile = ensureProfile(name);
            if (!profile) continue;

            profile.naraCount += 1;
            if (fit.isTarget) profile.targetCount += 1;
            if (date > profile.latestDate) profile.latestDate = date;
            profile.entries.push({
                id: `nara-${item.id}`,
                area: '奈良',
                source: item.municipality,
                title: item.title,
                date,
                type: item.type,
                amount: item.estimatedPrice,
                status: item.status,
                href: `/project/${item.id}`,
                external: false,
                fitLevel: fit.level,
                fitLabel: fit.shortLabel,
                isTarget: fit.isTarget,
            });
        }
    }

    // 2. 大阪3自治体（大阪府・大阪市・堺市）の奈良事務所落札を紐づけ
    for (const award of osakaNaraAwards) {
        const fit = evaluateSalesFit(award.title, award.kind);
        const names = award.matchedFirms.length > 0
            ? award.matchedFirms
            : (award.winner ? [award.winner] : []);

        const seenKeys = new Set<string>();
        for (const name of names) {
            const key = firmKey(name);
            if (!key || seenKeys.has(key)) continue;
            seenKeys.add(key);

            const profile = ensureProfile(name);
            if (!profile) continue;

            profile.osakaCount += 1;
            if (fit.isTarget) profile.targetCount += 1;
            if (award.openDate > profile.latestDate) profile.latestDate = award.openDate;
            profile.entries.push({
                id: `osaka-${award.key}`,
                area: '大阪',
                source: `${award.source} 入札結果`,
                title: award.title,
                date: award.openDate,
                type: award.kind,
                amount: award.amount,
                status: '落札',
                href: award.link,
                external: true,
                fitLevel: fit.level,
                fitLabel: fit.shortLabel,
                isTarget: fit.isTarget,
            });
        }
    }

    // 3. 建設ニュース（大阪受注記事を含む、ただし大阪入札結果と重複するソースは除く）を紐づけ
    for (const news of newsItems) {
        if (!news.watchedFirms?.length) continue;
        if (/大阪府|大阪市|堺市/.test(news.sourceLabel) && /入札結果/.test(news.sourceLabel)) continue;

        const fit = evaluateSalesFit(news.title, news.excerpt);
        const seenKeys = new Set<string>();
        for (const name of news.watchedFirms) {
            const key = firmKey(name);
            if (!key || seenKeys.has(key)) continue;
            seenKeys.add(key);

            const profile = ensureProfile(name);
            if (!profile) continue;

            profile.newsCount += 1;
            if (fit.isTarget) profile.targetCount += 1;
            if (news.date > profile.latestDate) profile.latestDate = news.date;
            profile.entries.push({
                id: `news-${news.link}`,
                area: 'ニュース',
                source: news.sourceLabel,
                title: news.title,
                date: news.date,
                href: news.link,
                external: true,
                fitLevel: fit.level,
                fitLabel: fit.shortLabel,
                isTarget: fit.isTarget,
            });
        }
    }

    // エントリを日付降順、事務所は奈良の最新動き（日付・奈良件数）順で並べる
    const list = Array.from(map.values())
        .filter(p => p.entries.length > 0)
        .map(p => ({
            ...p,
            entries: p.entries.sort((a, b) => (b.date || '').localeCompare(a.date || '')),
        }))
        .sort((a, b) => {
            if (b.latestDate !== a.latestDate) return (b.latestDate || '').localeCompare(a.latestDate || '');
            if (b.naraCount !== a.naraCount) return b.naraCount - a.naraCount;
            return b.entries.length - a.entries.length;
        });

    return list;
}

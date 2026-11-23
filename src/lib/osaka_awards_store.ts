import fs from 'fs';
import path from 'path';
import { findWatchedFirms } from '@/lib/watched_firms';
import { loadWatchedFirms } from '@/lib/watched_firms_store';

export const OSAKA_AWARDS_FILE = 'osaka_awards.json';

export const OSAKA_SOURCE_URLS = {
    大阪府: 'https://www.e-nyusatsu.pref.osaka.jp/CALS/Publish/EbController?Shori=KekkaInfo',
    大阪市: 'https://www.osaka.city.beneproc.com/#/anken-list/supplier-decided?page=0&pageSize=1000&sortId=bid_open_at__c&sortDesc=true',
    堺市: 'https://sakai.efftis.jp/ebid01/PPI/Public/PPUBC00100',
} as const;

export type OsakaSourceName = keyof typeof OSAKA_SOURCE_URLS;

export interface OsakaPrefRawResult {
    id: string;
    title: string;
    kind: string;
    location: string;
    openDate: string;
    winner?: string;
    address?: string;
    amount?: string;
    decided: boolean;
    checkedAt: string;
}

export interface SakaiRawResult {
    id: string;
    title: string;
    kind: string;
    openDate: string;
    winner?: string;
    amount?: string;
    checkedAt: string;
}

export interface OsakaCityRawResult {
    id: string;
    title: string;
    kind: string;
    openDate: string;
    winner?: string;
    amount?: string;
    checkedAt: string;
}

export interface OsakaAwardsRawStore {
    generatedAt: string | null;
    results: OsakaPrefRawResult[];
    sakai: SakaiRawResult[];
    osakaCity: OsakaCityRawResult[];
}

export interface OsakaAwardRecord {
    key: string;
    source: OsakaSourceName;
    title: string;
    kind: string;
    location?: string;
    openDate: string;
    winner?: string;
    address?: string;
    amount?: string;
    link: string;
    isNaraFirm: boolean;
    matchedFirms: string[];
    checkedAt: string;
}

export interface OsakaSourceSummary {
    source: OsakaSourceName;
    label: string;
    url: string;
    note: string;
    checkedCount: number;
    decidedCount: number;
    naraHitCount: number;
    lastCheckedAt: string | null;
}

const NARA_ADDRESS = new RegExp(`^(?:奈良県|${[
    '奈良市', '大和高田市', '大和郡山市', '天理市', '橿原市', '桜井市', '五條市', '御所市', '生駒市', '香芝市',
    '葛城市', '宇陀市', '山辺郡', '生駒郡', '磯城郡', '宇陀郡', '高市郡', '北葛城郡', '吉野郡',
].join('|')})`);

export function isNaraAddress(address?: string): boolean {
    return Boolean(address && NARA_ADDRESS.test(address.trim()));
}

export function loadOsakaAwardsRawStore(): OsakaAwardsRawStore {
    try {
        const raw = fs.readFileSync(path.join(process.cwd(), OSAKA_AWARDS_FILE), 'utf-8');
        const parsed = JSON.parse(raw) as Partial<OsakaAwardsRawStore>;
        return {
            generatedAt: parsed.generatedAt ?? null,
            results: Array.isArray(parsed.results) ? parsed.results : [],
            sakai: Array.isArray(parsed.sakai) ? parsed.sakai : [],
            osakaCity: Array.isArray(parsed.osakaCity) ? parsed.osakaCity : [],
        };
    } catch {
        return { generatedAt: null, results: [], sakai: [], osakaCity: [] };
    }
}

function latestIso(values: Array<string | undefined>): string | null {
    let best: string | null = null;
    for (const v of values) {
        if (!v) continue;
        if (!best || v > best) best = v;
    }
    return best;
}

export function loadOsakaAwardsView(): {
    generatedAt: string | null;
    records: OsakaAwardRecord[];
    naraAwards: OsakaAwardRecord[];
    summaries: OsakaSourceSummary[];
} {
    const store = loadOsakaAwardsRawStore();
    const firms = loadWatchedFirms();

    const prefRecords: OsakaAwardRecord[] = store.results.map(item => {
        const matched = item.winner ? findWatchedFirms(item.winner, firms).map(f => f.name) : [];
        const isNara = Boolean(item.decided && (isNaraAddress(item.address) || matched.length > 0));
        return {
            key: `pref-${item.id}`,
            source: '大阪府',
            title: item.title,
            kind: item.kind,
            location: item.location,
            openDate: item.openDate,
            winner: item.winner,
            address: item.address,
            amount: item.amount,
            link: OSAKA_SOURCE_URLS.大阪府,
            isNaraFirm: isNara,
            matchedFirms: matched.length > 0 ? matched : (isNara && item.winner ? [item.winner] : []),
            checkedAt: item.checkedAt,
        };
    });

    const sakaiRecords: OsakaAwardRecord[] = store.sakai.map(item => {
        const matched = item.winner ? findWatchedFirms(item.winner, firms).map(f => f.name) : [];
        const isNara = matched.length > 0;
        return {
            key: `sakai-${item.id}`,
            source: '堺市',
            title: item.title,
            kind: item.kind,
            openDate: item.openDate,
            winner: item.winner,
            amount: item.amount,
            link: OSAKA_SOURCE_URLS.堺市,
            isNaraFirm: isNara,
            matchedFirms: matched,
            checkedAt: item.checkedAt,
        };
    });

    const cityRecords: OsakaAwardRecord[] = store.osakaCity.map(item => {
        const matched = item.winner ? findWatchedFirms(item.winner, firms).map(f => f.name) : [];
        const isNara = matched.length > 0;
        return {
            key: `osaka-city-${item.id}`,
            source: '大阪市',
            title: item.title,
            kind: item.kind,
            openDate: item.openDate,
            winner: item.winner,
            amount: item.amount,
            link: OSAKA_SOURCE_URLS.大阪市,
            isNaraFirm: isNara,
            matchedFirms: matched,
            checkedAt: item.checkedAt,
        };
    });

    const records = [...prefRecords, ...cityRecords, ...sakaiRecords].sort((a, b) =>
        (b.openDate || '').localeCompare(a.openDate || '') || a.title.localeCompare(b.title),
    );
    const naraAwards = records.filter(r => r.isNaraFirm);

    const summaries: OsakaSourceSummary[] = [
        {
            source: '大阪府',
            label: '大阪府 電子調達（入札結果）',
            url: OSAKA_SOURCE_URLS.大阪府,
            note: '建築設計・設備設計の落札者住所から奈良の事務所を判定',
            checkedCount: prefRecords.length,
            decidedCount: prefRecords.filter(r => Boolean(r.winner)).length,
            naraHitCount: prefRecords.filter(r => r.isNaraFirm).length,
            lastCheckedAt: latestIso(prefRecords.map(r => r.checkedAt)) ?? store.generatedAt,
        },
        {
            source: '大阪市',
            label: '大阪市 調達・契約システム（業者決定済）',
            url: OSAKA_SOURCE_URLS.大阪市,
            note: '建築設計・監理の契約相手方を奈良の設計事務所名簿と照合',
            checkedCount: cityRecords.length,
            decidedCount: cityRecords.filter(r => Boolean(r.winner)).length,
            naraHitCount: cityRecords.filter(r => r.isNaraFirm).length,
            lastCheckedAt: latestIso(cityRecords.map(r => r.checkedAt)) ?? store.generatedAt,
        },
        {
            source: '堺市',
            label: '堺市 入札・契約結果（efftis）',
            url: OSAKA_SOURCE_URLS.堺市,
            note: '建築設計・設備設計の落札者を奈良の設計事務所名簿と照合',
            checkedCount: sakaiRecords.length,
            decidedCount: sakaiRecords.filter(r => Boolean(r.winner)).length,
            naraHitCount: sakaiRecords.filter(r => r.isNaraFirm).length,
            lastCheckedAt: latestIso(sakaiRecords.map(r => r.checkedAt)) ?? store.generatedAt,
        },
    ];

    return { generatedAt: store.generatedAt, records, naraAwards, summaries };
}

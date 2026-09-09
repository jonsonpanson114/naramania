import { AppShell } from '@/components/AppShell';
import { Header } from '@/components/Header';
import { BiddingTable } from '@/components/BiddingTable';
import { loadDashboardData } from '@/lib/dashboard_data';
import { resolveQuickLink } from '@/lib/quick_links';
import type { ViewTab } from '@/lib/practical_filters';

interface PageProps {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function asString(value: string | string[] | undefined): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

/** URLの値が想定内のときだけ採用する。想定外なら既定値に戻す */
function asOneOf<T extends string>(
    value: string | string[] | undefined,
    allowed: readonly T[],
    fallback: T,
): T {
    const candidate = asString(value);
    return candidate && (allowed as readonly string[]).includes(candidate) ? (candidate as T) : fallback;
}

const TABS = ['active', 'followUp', 'results', 'all'] as const;
const TYPES = ['すべて', '建築', '設計'] as const;
const WINNERS = ['すべて', 'ゼネコン', '設計事務所'] as const;
const SORTS = ['newest', 'oldest', 'biddingSoonest', 'biddingLatest', 'municipality'] as const;

export default async function SearchPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const { allItems } = loadDashboardData();

    // quick は「タブ」ではなく「用途別の絞り込み」。以前はタブにしか変換しておらず、
    // 学校トイレ(schoolToilet)は対応が無くて受付中一覧になり、
    // 落札者未登録(missingWinner)は追跡待ちタブに化けていた。
    // 押した名前と出てくる一覧が違うのは、間違った案件を見ることに直結する。
    const quickParam = asString(params.quick);
    const quick = resolveQuickLink(quickParam);

    // 絞り込み条件はすべてURLから受け取る。一覧側が状態をURLへ書き戻すので、
    // 案件詳細から戻ってきたときにこのパスで条件が復元される。
    //
    // quick の指定が無い素の /search は従来どおり「受付中」で開く。
    // quick.tab をそのまま既定にすると、すべて(all)扱いになって
    // サイドバーの「案件検索」が全件表示に変わってしまう。
    const defaultTab: ViewTab = quickParam ? quick.tab : 'active';
    const initialTab: ViewTab = asOneOf(params.tab, TABS, defaultTab);
    const initialKeyword = asString(params.q) || '';
    const initialMunicipality = asString(params.municipality) || 'すべて';
    const initialType = asOneOf(params.type, TYPES, 'すべて');
    const initialWinner = asOneOf(params.winner, WINNERS, 'すべて');
    const initialSort = asOneOf(params.sort, SORTS, 'newest');
    const initialTag = asString(params.tag) || null;
    const showParam = Number(asString(params.show));
    const initialVisibleCount = Number.isFinite(showParam) && showParam > 0 ? showParam : undefined;

    return (
        <AppShell>
            <Header />
            <div className="mb-8">
                <h2 className="text-3xl tracking-widest font-serif">案件検索</h2>
                <p className="mt-3 text-secondary/60 text-sm tracking-wider">
                    {quick.key === 'all'
                        ? 'タブとキーワード、自治体で案件を絞り込めます。'
                        : `「${quick.label}」で絞り込んでいます。${quick.description}`}
                </p>
            </div>
            <BiddingTable
                items={allItems}
                initialTab={initialTab}
                initialKeyword={initialKeyword}
                initialMunicipality={initialMunicipality}
                quickFilterKey={quick.key === 'all' ? undefined : quick.key}
                initialType={initialType}
                initialWinner={initialWinner}
                initialSort={initialSort}
                initialTag={initialTag}
                initialVisibleCount={initialVisibleCount}
            />
        </AppShell>
    );
}

import { AppShell } from '@/components/AppShell';
import { Header } from '@/components/Header';
import { BiddingTable } from '@/components/BiddingTable';
import { loadDashboardData } from '@/lib/dashboard_data';
import { resolveQuickLink } from '@/lib/quick_links';

interface PageProps {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function asString(value: string | string[] | undefined): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

export default async function SearchPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const { allItems } = loadDashboardData();

    // quick は「タブ」ではなく「用途別の絞り込み」。以前はタブにしか変換しておらず、
    // 学校トイレ(schoolToilet)は対応が無くて受付中一覧になり、
    // 落札者未登録(missingWinner)は追跡待ちタブに化けていた。
    // 押した名前と出てくる一覧が違うのは、間違った案件を見ることに直結する。
    const quick = resolveQuickLink(asString(params.quick));
    const initialKeyword = asString(params.q) || '';
    const initialMunicipality = asString(params.municipality) || 'すべて';

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
                initialTab={quick.tab}
                initialKeyword={initialKeyword}
                initialMunicipality={initialMunicipality}
                quickFilterKey={quick.key === 'all' ? undefined : quick.key}
            />
        </AppShell>
    );
}

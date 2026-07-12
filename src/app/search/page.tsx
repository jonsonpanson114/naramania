import { AppShell } from '@/components/AppShell';
import { Header } from '@/components/Header';
import { BiddingTable, type ViewTab } from '@/components/BiddingTable';
import { loadDashboardData } from '@/lib/dashboard_data';

const QUICK_TO_TAB: Record<string, ViewTab> = {
    active: 'active',
    resultFollowUp: 'followUp',
    missingWinner: 'followUp',
    opened: 'results',
    all: 'all',
};

interface PageProps {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function asString(value: string | string[] | undefined): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

export default async function SearchPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const { allItems } = loadDashboardData();

    const quick = asString(params.quick);
    const initialTab: ViewTab = (quick && QUICK_TO_TAB[quick]) || 'active';
    const initialKeyword = asString(params.q) || '';
    const initialMunicipality = asString(params.municipality) || 'すべて';

    return (
        <AppShell>
            <Header />
            <div className="mb-8">
                <h2 className="text-3xl tracking-widest font-serif">案件検索</h2>
                <p className="mt-3 text-secondary/60 text-sm tracking-wider">
                    タブとキーワード、自治体で案件を絞り込めます。
                </p>
            </div>
            <BiddingTable
                items={allItems}
                initialTab={initialTab}
                initialKeyword={initialKeyword}
                initialMunicipality={initialMunicipality}
            />
        </AppShell>
    );
}

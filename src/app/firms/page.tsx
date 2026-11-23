import { AppShell } from '@/components/AppShell';
import { FirmsDirectoryClient } from '@/components/FirmsDirectoryClient';
import { loadDashboardData } from '@/lib/dashboard_data';
import { loadNewsStore } from '@/lib/news_store';
import { loadOsakaAwardsView } from '@/lib/osaka_awards_store';
import { buildFirmDirectory } from '@/lib/firms_directory';

export default async function FirmsPage({
    searchParams,
}: {
    searchParams: Promise<{ firm?: string }>;
}) {
    const params = await searchParams;
    const { allItems, qualitySummary } = loadDashboardData();
    const osakaView = loadOsakaAwardsView();
    const newsStore = loadNewsStore();
    const firms = buildFirmDirectory(allItems, osakaView.naraAwards, newsStore.items);

    return (
        <AppShell updatedAt={qualitySummary?.generatedAt}>
            <div className="mb-6">
                <h1 className="paper-title">設計事務所</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-secondary">
                    奈良の公共案件と、大阪府・大阪市・堺市での受注を設計事務所ごとにまとめて確認できます。
                    よく行く事務所をピン留めしておくと、トップページに最新動向が優先表示されます。
                </p>
            </div>
            <FirmsDirectoryClient firms={firms} initialFirmKey={params.firm} />
        </AppShell>
    );
}

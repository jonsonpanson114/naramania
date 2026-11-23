import { AppShell } from '@/components/AppShell';
import { NewsPageTabs } from '@/components/NewsPageTabs';
import { loadOsakaAwardsView } from '@/lib/osaka_awards_store';

export default async function NewsPage({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string; scope?: string }>;
}) {
    const params = await searchParams;
    const osakaView = loadOsakaAwardsView();
    const initialTab = params.tab === 'osaka' ? 'osaka' : 'news';
    const initialOsakaScope = params.scope === 'all' ? 'all' : 'nara';

    return (
        <AppShell>
            <div className="mb-4">
                <h1 className="paper-title">ニュース</h1>
                <p className="mt-1.5 text-sm text-secondary">
                    奈良の建設ニュースを確認できます。参考として大阪エリアの設計入札結果もタブから切り替えられます。
                </p>
            </div>
            <NewsPageTabs
                initialTab={initialTab}
                initialOsakaScope={initialOsakaScope}
                osakaRecords={osakaView.records}
                osakaSummaries={osakaView.summaries}
                osakaGeneratedAt={osakaView.generatedAt}
            />
        </AppShell>
    );
}

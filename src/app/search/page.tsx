import { AppShell } from '@/components/AppShell';
import { loadDashboardData } from '@/lib/dashboard_data';
import { SearchClient } from './SearchClient';

export default async function SearchPage() {
    const { allItems } = loadDashboardData();

    return (
        <AppShell>
            <SearchClient items={allItems} />
        </AppShell>
    );
}

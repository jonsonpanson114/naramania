import { AppShell } from '@/components/AppShell';
import { NewsSection } from '@/components/NewsSection';

export default function NewsPage() {
    return (
        <AppShell>
            <h2 className="text-2xl font-bold text-stone-900">ニュース</h2>
            <NewsSection detailed pageSize={50} />
        </AppShell>
    );
}

import { AppShell } from '@/components/AppShell';
import { Header } from '@/components/Header';
import { NewsSection } from '@/components/NewsSection';

export default function NewsPage() {
    return (
        <AppShell>
            <Header />
            <div className="mb-8">
                <h2 className="text-3xl tracking-widest font-serif">ニュース</h2>
                <p className="mt-3 text-secondary/60 text-sm tracking-wider">
                    奈良県内の入札・建設関連ニュースをまとめて確認できます。キーワードでの検索にも対応しています。
                </p>
            </div>
            <NewsSection detailed pageSize={10} />
        </AppShell>
    );
}

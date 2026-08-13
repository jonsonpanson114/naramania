import { AppShell } from '@/components/AppShell';
import { loadMarketItems } from '@/lib/dashboard_data';
import { MarketClient, type MarketRow } from './MarketClient';
import { Store } from 'lucide-react';

/**
 * 業者名から業種を推定する。
 * スクレイパーが付ける winnerType は「案件の種別」由来（業務委託→コンサル→設計事務所）で、
 * ごみ資源売却業者や印刷会社まで設計事務所に分類されてしまう。
 * 業者別の集計では会社名そのもので判定する。
 */
function classifyByName(name: string): '設計事務所' | 'ゼネコン' | 'その他' {
    if (/設計|コンサル|測量|建築事務所|アトリエ|技術研究所|工学研究所|技研|地質|補償/.test(name)) {
        return '設計事務所';
    }
    if (/建設|工業|工務店|土木|建築|興業|舗装|組$|組\s|造園|電気|管工|設備/.test(name)) {
        return 'ゼネコン';
    }
    return 'その他';
}

export default async function MarketPage() {
    const items = loadMarketItems();

    // クライアントに渡すのは表示に使う項目だけに絞る（description等の重いフィールドは落とす）
    const rows: MarketRow[] = items.map(item => ({
        id: item.id,
        municipality: item.municipality,
        title: item.title,
        type: item.type,
        announcementDate: item.announcementDate,
        ...(item.biddingDate ? { biddingDate: item.biddingDate } : {}),
        link: item.link,
        status: item.status,
        ...(item.winningContractor ? { winningContractor: item.winningContractor } : {}),
        ...(item.designFirm ? { designFirm: item.designFirm } : {}),
        ...(item.winningContractor ? { winnerType: classifyByName(item.winningContractor) } : {}),
        ...(item.estimatedPrice ? { estimatedPrice: item.estimatedPrice } : {}),
        isRelevant: item.isRelevant,
    }));

    return (
        <AppShell>
            <div className="mb-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[10px] font-bold tracking-[0.22em] text-sky-700 uppercase">
                    <Store size={14} />
                    Market
                </div>
                <h2 className="mt-4 text-3xl font-light tracking-[0.08em] text-primary font-serif">市場全体</h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 tracking-[0.04em] text-secondary/65">
                    案件検索は建築・設計監理に絞った掲載対象だけを扱いますが、こちらは収集した全案件を扱います。
                    土木・設備など自社の対象外案件も含めて、どの設計事務所・ゼネコンがどれだけ受注しているかを追えます。
                </p>
            </div>

            {rows.length === 0 ? (
                <div className="rounded-[2rem] border border-dashed border-stone-300 bg-white/70 px-6 py-16 text-center">
                    <p className="text-sm leading-7 tracking-[0.06em] text-stone-500">
                        市場データ(market_items.json)はまだ生成されていません。
                        <br />
                        次回のスクレイプ実行後に、収集した全案件がここに表示されます。
                    </p>
                </div>
            ) : (
                <MarketClient items={rows} />
            )}
        </AppShell>
    );
}

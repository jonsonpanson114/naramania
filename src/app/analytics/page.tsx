import { BiddingItem, Municipality, BiddingType } from '@/types/bidding';
import { AppShell } from '@/components/AppShell';
import RankingChart from '@/components/RankingChart';
import RadarChart from '@/components/RadarChart';
import { loadDashboardData } from '@/lib/dashboard_data';
import { getMonthlyAnnouncements } from '@/lib/monthly_announcements';
import { MunicipalityBadge } from '@/components/ProjectLabels';

interface ScatterDataPoint {
    name: string;
    municipality: Municipality;
    price: number;
    priceLabel: string;
    contractor: string;
    type: BiddingType;
}

// Convert "12,345,000円" to 12345000.
// 「1,834,283,000円(消費税10%含む)」のような注記の数字まで連結しないよう、
// 「円」の直前の数字列だけを金額として扱う。
function parsePrice(priceStr?: string): number | null {
    if (!priceStr) return null;
    const yenMatch = priceStr.match(/([0-9][0-9,]*)\s*円/);
    const target = yenMatch ? yenMatch[1] : (priceStr.match(/[0-9][0-9,]*/)?.[0] ?? '');
    const num = parseInt(target.replace(/,/g, ''), 10);
    return Number.isFinite(num) && num > 0 ? num : null;
}

function formatCurrency(val: number): string {
    if (val >= 100000000) return `${(val / 100000000).toFixed(1)}億円`;
    if (val >= 10000) return `${(val / 10000).toLocaleString()}万円`;
    return `${val}円`;
}

export default async function AnalyticsPage() {
    const { allItems: items } = loadDashboardData();

    // --- 落札実績ランキング ---
    const contractorStats: Record<string, { count: number, totalAmount: number }> = {};
    const designStats: Record<string, { count: number, totalAmount: number }> = {};

    const parseAmount = (price: string | undefined): number => parsePrice(price) ?? 0;

    items.forEach((item: BiddingItem) => {
        if (item.winningContractor) {
            const stats = contractorStats[item.winningContractor] || { count: 0, totalAmount: 0 };
            stats.count += 1;
            stats.totalAmount += parseAmount(item.estimatedPrice);
            contractorStats[item.winningContractor] = stats;
        }
        if (item.designFirm) {
            const stats = designStats[item.designFirm] || { count: 0, totalAmount: 0 };
            stats.count += 1;
            stats.totalAmount += parseAmount(item.estimatedPrice);
            designStats[item.designFirm] = stats;
        }
    });

    const topContractorsByCount = Object.entries(contractorStats)
        .map(([name, stats]) => ({ name, count: stats.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    const topContractorsByAmount = Object.entries(contractorStats)
        .map(([name, stats]) => ({ name, amount: stats.totalAmount, count: stats.count }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);

    const topDesignFirmsByCount = Object.entries(designStats)
        .map(([name, stats]) => ({ name, count: stats.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    // --- 価格相場 ---
    const scatterData: ScatterDataPoint[] = items.map((item: BiddingItem) => {
        const price = parsePrice(item.estimatedPrice);
        if (!price) return null;

        return {
            name: item.title,
            municipality: item.municipality,
            price: price,
            priceLabel: item.estimatedPrice ?? '',
            contractor: item.winningContractor || '未定',
            type: item.type,
        };
    }).filter((i): i is ScatterDataPoint => i !== null);

    scatterData.sort((a, b) => b.price - a.price);

    const totalWithPrice = scatterData.length;
    const avgPrice = totalWithPrice > 0
        ? Math.round(scatterData.reduce((acc, curr) => acc + curr.price, 0) / totalWithPrice)
        : 0;
    const maxItem = scatterData[0];

    // --- 自治体別の動き ---
    const municipalityStats = new Map<string, { total: number; active: number; awarded: number; failed: number; cancelled: number }>();
    items.forEach((item) => {
        const stats = municipalityStats.get(item.municipality) || { total: 0, active: 0, awarded: 0, failed: 0, cancelled: 0 };
        stats.total += 1;
        if (item.status === '受付中') stats.active += 1;
        if (item.status === '落札') stats.awarded += 1;
        if (item.status === '不調') {
            if (item.cancelled) stats.cancelled += 1;
            else stats.failed += 1;
        }
        municipalityStats.set(item.municipality, stats);
    });
    const municipalityRows = Array.from(municipalityStats.entries())
        .map(([municipality, stats]) => ({
            municipality,
            ...stats,
            failRate: stats.awarded + stats.failed > 0
                ? Math.round((stats.failed / (stats.awarded + stats.failed)) * 100)
                : null,
        }))
        .sort((a, b) => b.total - a.total);

    const { months: monthlyAnnouncements, countsByMunicipality: monthCounts } = getMonthlyAnnouncements(items);
    const currentMonth = Number(monthlyAnnouncements.at(-1)?.month.slice(5));
    const announcementTotal = monthlyAnnouncements.reduce((total, { count }) => total + count, 0);
    const maxAnnouncements = Math.max(0, ...monthlyAnnouncements.map(({ count }) => count));
    const tickStep = Math.max(1, maxAnnouncements <= 20 ? Math.ceil(maxAnnouncements / 4) : Math.ceil(maxAnnouncements / 20) * 5);
    const heatMunicipalities = municipalityRows.slice(0, 12).map(row => row.municipality);
    const maxMonthCount = Math.max(1, ...Array.from(monthCounts.values()));

    const heatColor = (count: number): string => {
        if (count === 0) return 'text-secondary';
        const ratio = count / maxMonthCount;
        if (ratio > 0.66) return 'bg-accent text-white';
        if (ratio > 0.33) return 'bg-emerald-200 text-primary';
        return 'bg-paper-tint text-primary';
    };

    return (
        <AppShell>
            <header className="mb-6 flex flex-wrap items-baseline gap-x-5 gap-y-2 border-b border-border pb-4">
                <h1 className="paper-title">市場分析</h1>
                <p className="text-sm font-semibold text-accent sm:text-base">奈良県の公告・落札の動き</p>
            </header>

            <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
                <div className="min-w-0 space-y-5">
                    <section className="paper-panel" aria-labelledby="monthly-announcement-heading">
                        <h2 id="monthly-announcement-heading" className="paper-heading">月別の公告件数</h2>
                        <div className="grid gap-5 p-4 sm:p-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                            <div
                                role="img"
                                aria-label={monthlyAnnouncements.map(({ month, count }) => `${month}：${count}件`).join('、')}
                                className="relative mt-4 mb-8 ml-11 min-w-0"
                            >
                                <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                                    {[4, 3, 2, 1, 0].map(tick => (
                                        <div key={tick} className="absolute w-full border-t border-border" style={{ bottom: `${tick * 25}%` }}>
                                            <span className="absolute right-full mr-2 -translate-y-1/2 whitespace-nowrap text-xs tabular-nums text-secondary">
                                                {tick * tickStep}件
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <div aria-hidden="true" className="relative grid h-48 grid-cols-6 items-end gap-2 px-1 sm:h-56 sm:gap-3">
                                    {monthlyAnnouncements.map(({ month, count }, index) => (
                                        <div
                                            key={month}
                                            className={`relative mx-auto w-full max-w-24 rounded-t-sm ${index === monthlyAnnouncements.length - 1 ? 'bg-emerald-200' : 'bg-accent'}`}
                                            style={{ height: `${(count / (tickStep * 4)) * 100}%` }}
                                        >
                                            <span className="absolute inset-x-0 bottom-full pb-1 text-center text-sm font-bold tabular-nums">{count}</span>
                                            <span className="absolute inset-x-0 top-full mt-1.5 text-center text-xs font-semibold tabular-nums">{Number(month.slice(5))}月</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="border-t border-border pt-4 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
                                <p className="paper-eyebrow">直近6か月</p>
                                <p className="mt-2 text-lg font-bold leading-7">
                                    収集した公告は計 <span className="tabular-nums text-accent">{announcementTotal.toLocaleString('ja-JP')}</span> 件
                                </p>
                                <p className="mt-2 text-sm leading-7 text-secondary">
                                    公告日をもとに集計しています。発注見通しは含みません。{currentMonth}月は月途中の集計です。
                                </p>
                            </div>
                        </div>
                    </section>

                    <section className="paper-panel" aria-labelledby="municipality-heatmap-heading">
                        <h2 id="municipality-heatmap-heading" className="paper-heading">自治体別の公告件数</h2>
                        <div className="p-4 sm:p-5">
                            <p className="mb-3 text-sm text-secondary">直近6か月・掲載件数上位{heatMunicipalities.length}自治体</p>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[480px] border-separate border-spacing-1 text-center text-sm tabular-nums">
                                    <thead className="bg-paper-tint">
                                        <tr>
                                            <th scope="col" className="px-2 py-2 text-left">自治体</th>
                                            {monthlyAnnouncements.map(({ month }) => (
                                                <th key={month} scope="col" className="px-1 py-2">{Number(month.slice(5))}月</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {heatMunicipalities.map(municipality => (
                                            <tr key={municipality} className="odd:bg-background/65">
                                                <th scope="row" className="whitespace-nowrap px-2 py-2 text-left font-semibold"><MunicipalityBadge name={municipality} /></th>
                                                {monthlyAnnouncements.map(({ month }) => {
                                                    const count = monthCounts.get(`${municipality}:${month}`) ?? 0;
                                                    return (
                                                        <td key={month} className={`rounded-sm py-2 font-semibold ${heatColor(count)}`}>
                                                            {count}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </section>
                </div>

                <div className="min-w-0 space-y-5">
                    <section className="paper-panel" aria-labelledby="award-ranking-heading">
                        <h2 id="award-ranking-heading" className="paper-heading">落札実績ランキング</h2>
                        <div className="p-4">
                            <p className="mb-3 text-sm text-secondary">落札者別の予定価格合計・収集データ全期間</p>
                            {topContractorsByAmount.length > 0 ? (
                                <table className="w-full text-sm tabular-nums">
                                    <thead className="bg-paper-tint">
                                        <tr>
                                            <th scope="col" className="px-2 py-2 text-left">事業者名</th>
                                            <th scope="col" className="px-2 py-2 text-right">件数</th>
                                            <th scope="col" className="px-2 py-2 text-right">合計</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {topContractorsByAmount.map((contractor, index) => (
                                            <tr key={contractor.name} className="border-b border-border/70 first:bg-paper-tint/75 even:bg-background/65 last:border-0">
                                                <th scope="row" className="px-2 py-2.5 text-left font-semibold [overflow-wrap:anywhere]">
                                                    <span className="mr-2 inline-block font-bold text-accent">{index + 1}</span>
                                                    {contractor.name}
                                                </th>
                                                <td className="whitespace-nowrap px-2 py-2.5 text-right">{contractor.count}</td>
                                                <td className="whitespace-nowrap px-2 py-2.5 text-right font-semibold">{contractor.amount > 0 ? formatCurrency(contractor.amount) : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <p className="text-sm text-secondary">落札者のデータがありません。</p>
                            )}
                        </div>
                    </section>

                    <section className="paper-panel" aria-labelledby="price-overview-heading">
                        <h2 id="price-overview-heading" className="paper-heading">価格相場</h2>
                        <dl className="divide-y divide-border p-4 text-sm">
                            <div className="flex items-baseline justify-between gap-3 py-3 first:pt-0">
                                <dt className="text-secondary">予定価格のある案件</dt>
                                <dd className="shrink-0 font-bold tabular-nums">{totalWithPrice.toLocaleString('ja-JP')} 件</dd>
                            </div>
                            <div className="flex items-baseline justify-between gap-3 py-3">
                                <dt className="text-secondary">平均予定価格</dt>
                                <dd className="shrink-0 font-bold tabular-nums">{totalWithPrice ? `${avgPrice.toLocaleString('ja-JP')} 円` : '—'}</dd>
                            </div>
                            <div className="flex items-baseline justify-between gap-3 pt-3">
                                <dt className="text-secondary">最高予定価格</dt>
                                <dd className="shrink-0 font-bold tabular-nums">{maxItem ? `${maxItem.price.toLocaleString('ja-JP')} 円` : '—'}</dd>
                            </div>
                            {maxItem && (
                                <div className="mt-3 pt-3">
                                    <dt className="sr-only">最高予定価格の案件</dt>
                                    <dd className="text-sm leading-6">
                                        <span className="font-semibold">{maxItem.name}</span>
                                        <span className="block text-secondary">{maxItem.municipality} · {maxItem.contractor}</span>
                                    </dd>
                                </div>
                            )}
                        </dl>
                    </section>
                </div>
            </div>

            <div className="mt-5 space-y-5">
                <div className="grid min-w-0 gap-5 lg:grid-cols-2">
                    <section className="paper-panel min-w-0" aria-labelledby="contractor-count-heading">
                        <h2 id="contractor-count-heading" className="paper-heading">受注件数（ゼネコン）</h2>
                        <div className="p-4">
                            {topContractorsByCount.length > 0 ? (
                                <RankingChart data={topContractorsByCount} color="#174b38" />
                            ) : (
                                <p className="text-sm text-secondary">落札者のデータがありません。</p>
                            )}
                        </div>
                    </section>
                    <section className="paper-panel min-w-0" aria-labelledby="design-count-heading">
                        <h2 id="design-count-heading" className="paper-heading">設計回数（事務所）</h2>
                        <div className="p-4">
                            {topDesignFirmsByCount.length > 0 ? (
                                <RankingChart data={topDesignFirmsByCount} color="#47785f" />
                            ) : (
                                <p className="text-sm text-secondary">設計事務所のデータがありません。</p>
                            )}
                        </div>
                    </section>
                </div>

                <section className="paper-panel" aria-labelledby="price-distribution-heading">
                    <h2 id="price-distribution-heading" className="paper-heading">予定価格の分布</h2>
                    <div className="p-4">
                        {scatterData.length > 0 ? (
                            <RadarChart data={scatterData} />
                        ) : (
                            <p className="py-8 text-center text-sm text-secondary">予定価格のデータがありません。</p>
                        )}
                    </div>
                </section>

                <section className="paper-panel" aria-labelledby="municipality-status-heading">
                    <h2 id="municipality-status-heading" className="paper-heading">自治体別の掲載・落札・不調</h2>
                    <div className="p-4 sm:p-5">
                        <p className="mb-3 text-sm leading-6 text-secondary">不調率は開札結果（落札・不調）に占める不調の割合です。開札前の中止は不調率に含みません。</p>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[480px] text-sm tabular-nums">
                                <thead className="bg-paper-tint">
                                    <tr>
                                        <th scope="col" className="px-3 py-2 text-left">自治体</th>
                                        <th scope="col" className="px-3 py-2 text-right">掲載</th>
                                        <th scope="col" className="px-3 py-2 text-right">受付中</th>
                                        <th scope="col" className="px-3 py-2 text-right">落札</th>
                                        <th scope="col" className="px-3 py-2 text-right">不調</th>
                                        <th scope="col" className="px-3 py-2 text-right">中止</th>
                                        <th scope="col" className="px-3 py-2 text-right">不調率</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {municipalityRows.map(row => (
                                        <tr key={row.municipality} className="border-b border-border/70 even:bg-background/65 last:border-0">
                                            <th scope="row" className="px-3 py-2 text-left font-semibold"><MunicipalityBadge name={row.municipality} /></th>
                                            <td className="px-3 py-2 text-right">{row.total}</td>
                                            <td className="px-3 py-2 text-right">{row.active || '—'}</td>
                                            <td className="px-3 py-2 text-right text-accent">{row.awarded || '—'}</td>
                                            <td className="px-3 py-2 text-right text-amber-800">{row.failed || '—'}</td>
                                            <td className="px-3 py-2 text-right">{row.cancelled || '—'}</td>
                                            <td className={`px-3 py-2 text-right font-semibold ${row.failRate !== null && row.failRate >= 30 ? 'text-amber-800' : 'text-secondary'}`}>
                                                {row.failRate !== null ? `${row.failRate}%` : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
            </div>
        </AppShell>
    );
}

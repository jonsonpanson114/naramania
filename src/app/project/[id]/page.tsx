import { BiddingItem } from '@/types/bidding';
import { AppShell } from '@/components/AppShell';
import { ProjectActionPanel } from '@/components/ProjectActionPanel';
import fs from 'fs';
import path from 'path';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, FileText, CheckCircle2, AlertTriangle, Search } from 'lucide-react';
import { getBiddingLabel } from '@/lib/bidding_schedule';
import { isOpenedItem, isSchoolToiletItem } from '@/lib/practical_filters';
import { displayStatus, statusLabel } from '@/lib/status_label';
import { formatJstDateLabel } from '@/lib/jst_date';

interface PageProps {
    params: Promise<{ id: string }>;
}

function formatDate(dateStr?: string): string {
    if (!dateStr) return '未設定';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return formatJstDateLabel(date);
}

// Materials detection logic for subcontractors
const detectMaterials = (description?: string): { name: string; icon: string; match: string }[] => {
    if (!description) return [];
    
    const materials = [
        { name: 'アルミサッシ・建具', icon: '🪟', keywords: ['サッシ', 'アルミ窓', 'ガラス', '建具', '網戸', 'スチールドア'] },
        { name: '空調・換気設備', icon: '🍃', keywords: ['空調', 'エアコン', '換気', '冷暖房', 'ダクト', '室外機'] },
        { name: '電気・照明設備', icon: '💡', keywords: ['照明', 'LED', '電気工事', '受変電', '配線', 'コンセント'] },
        { name: '内装・木質化', icon: '🪵', keywords: ['内装', '木材', 'フローリング', '木質', 'クロス', '天井仕上げ', '間仕切り'] },
        { name: 'エレベーター・昇降機', icon: '🛗', keywords: ['エレベーター', '昇降機', 'EV', 'エスカレーター'] },
        { name: '給排水・衛生設備', icon: '🚰', keywords: ['給排水', '配管', 'トイレ', '衛生', '便器', '給湯'] },
        { name: '防災・防犯設備', icon: '🚨', keywords: ['防災', 'スプリンクラー', '消火栓', '防犯', '火災報知', '非常通報'] }
    ];
    
    const detected: { name: string; icon: string; match: string }[] = [];
    const descLower = description.toLowerCase();
    
    for (const m of materials) {
        const foundKeyword = m.keywords.find(k => descLower.includes(k));
        if (foundKeyword) {
            detected.push({
                name: m.name,
                icon: m.icon,
                match: foundKeyword
            });
        }
    }
    return detected;
};

function getResultAudit(item: BiddingItem) {
    const opened = isOpenedItem(item);
    if (item.status === '落札' && item.winningContractor) {
        return {
            tone: 'ok' as const,
            title: '開札・落札情報は確認済み',
            message: '落札状態、開札日、落札者がそろっています。元請けへの営業確認に使える状態です。',
        };
    }
    if (item.status === '落札' && !item.winningContractor) {
        return {
            tone: 'warn' as const,
            title: '落札者が未取得です',
            message: '落札済みですが落札者が空です。結果PDFまたは公式ページの再確認対象です。',
        };
    }
    if (opened) {
        return {
            tone: 'warn' as const,
            title: '開札済みの可能性があります',
            message: '開札日を過ぎています。落札者・不調・受付終了の結果確認を優先してください。',
        };
    }
    if (item.status === '受付中') {
        return {
            tone: 'active' as const,
            title: '受付中の案件です',
            message: 'まだ開札前です。公告資料、締切、参加条件を確認する段階です。',
        };
    }
    return {
        tone: 'neutral' as const,
        title: '結果確認が必要です',
        message: '開札日または結果情報が不足しています。公式ページで更新状況を確認してください。',
    };
}

export default async function ProjectDetailPage({ params }: PageProps) {
    const { id: rawId } = await params;
    // params.id はURLエンコードされたまま渡ってくる。日本語を含むid
    // (例: sakurai-2026-09-01-桜井市立みなみこども園-建設工事)はデコードしないと
    // 一致せず、詳細ページが常に「案件が見つかりません」になっていた。
    let id = rawId;
    try {
        id = decodeURIComponent(rawId);
    } catch {
        // 不正なエスケープを含むURLはそのまま扱う
    }

    // Load data
    const jsonPath = path.join(process.cwd(), 'scraper_result.json');
    const marketPath = path.join(process.cwd(), 'market_items.json');
    let item: BiddingItem | null = null;
    let allItems: BiddingItem[] = [];

    try {
        if (fs.existsSync(jsonPath)) {
            allItems = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            item = allItems.find(i => i.id === id) || null;
        }
    } catch {
        // エラー時はnull
    }

    // 本線(scraper_result.json)に無ければ市場全体からも探す。
    // /market は建築フィルタ対象外の案件にも詳細リンクを張っているため、
    // 本線だけを見ていると対象外案件(2000件超)が全て「案件が見つかりません」に
    // なっていた。関連案件の一覧には本線側を使いたいので allItems は上書きしない。
    if (!item) {
        try {
            if (fs.existsSync(marketPath)) {
                const marketItems: BiddingItem[] = JSON.parse(fs.readFileSync(marketPath, 'utf-8'));
                item = marketItems.find(i => i.id === id) || null;
            }
        } catch {
            // エラー時はnull
        }
    }

    if (!item) {
        return (
            <AppShell>
                <div className="paper-panel px-5 py-12 text-center">
                    <h1 className="paper-title mb-5">案件が見つかりません</h1>
                    <Link href="/search" className="paper-button">
                        <ArrowLeft size={16} aria-hidden="true" /> 案件検索に戻る
                    </Link>
                </div>
            </AppShell>
        );
    }

    // Related items (same municipality, different ID)
    const related = allItems
        .filter(i => i.municipality === item!.municipality && i.id !== item!.id)
        .sort((a, b) => new Date(b.announcementDate).getTime() - new Date(a.announcementDate).getTime())
        .slice(0, 3);

    const brief = item.brief?.found ? item.brief : undefined;
    const price = item.estimatedPrice || brief?.price;
    const period = item.constructionPeriod || brief?.period;
    const briefRows = [
        { label: '場所', value: brief?.location },
        { label: '規模', value: brief?.scale },
        { label: '参加資格', value: brief?.qualification },
    ].filter((row): row is { label: string; value: string } => Boolean(row.value));
    const detectedMaterials = detectMaterials([item.description, brief?.summary, brief?.scale].filter(Boolean).join(' '));
    const resultAudit = getResultAudit(item);
    const isSchoolToilet = isSchoolToiletItem(item);
    const status = displayStatus(item);
    const statusTone = status === '落札' || status === '受付中'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
        : status === '不調' || status === '中止' || status === '締切切迫' || status === '締切間近'
            ? 'border-amber-200 bg-amber-50 text-amber-900'
            : 'border-border bg-background text-secondary';
    const sourceUrl = item.link || item.pdfUrl;
    const dateLabel = getBiddingLabel(item);
    const dates = [
        { label: '公告日', value: item.announcementDate },
        { label: dateLabel, value: item.biddingDate },
    ];

    return (
        <AppShell>
            <nav aria-label="パンくずリスト" className="mb-3 flex flex-wrap items-center gap-2 text-sm text-secondary">
                <Link href="/search" className="inline-flex items-center gap-1.5 font-bold text-accent hover:underline">
                    <ArrowLeft size={15} aria-hidden="true" /> 案件検索
                </Link>
                <span aria-hidden="true">/</span>
                <span aria-current="page">案件詳細</span>
            </nav>

            <header className="mb-5">
                <h1 className="paper-title">{item.title}</h1>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        <span className="rounded-sm border border-border bg-surface px-2.5 py-1">{item.municipality}</span>
                        <span className="rounded-sm border border-border bg-surface px-2.5 py-1">{item.type}</span>
                        <span className={`rounded-sm border px-2.5 py-1 ${statusTone}`}>{statusLabel(status)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {sourceUrl && (
                            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="paper-button paper-button-primary">
                                <ExternalLink size={16} aria-hidden="true" /> {item.link ? '公式ページを開く' : '掲載資料を開く'}
                            </a>
                        )}
                        <ProjectActionPanel key={item.id} item={item} />
                    </div>
                </div>
            </header>

            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
                <div className="min-w-0 space-y-4">
                    <dl className="paper-panel grid grid-cols-2 gap-1.5 p-1.5">
                        {dates.map(({ label, value }) => (
                            <div key={label} className={`min-w-0 rounded px-3 py-2.5 sm:px-4 ${label === dateLabel ? 'bg-paper-tint' : ''}`}>
                                <dt className="text-sm font-bold text-secondary">{label}</dt>
                                <dd className="mt-1 text-base font-bold tabular-nums sm:text-xl">{formatDate(value)}</dd>
                            </div>
                        ))}
                    </dl>

                    <section className="paper-panel p-2">
                        <h2 className="paper-heading">工事・業務の概要</h2>
                        <div className="space-y-4 px-2 py-3 sm:px-3">
                            {brief?.summary && <p className="whitespace-pre-wrap text-base leading-7 [overflow-wrap:anywhere]">{brief.summary}</p>}
                            {(briefRows.length > 0 || period || item.designFirm) && (
                                <dl className="overflow-hidden rounded border border-border text-sm leading-6 sm:text-[15px]">
                                    {[
                                        ...briefRows,
                                        { label: '工期', value: period },
                                        { label: '設計事務所', value: item.designFirm },
                                    ].filter(row => row.value).map(({ label, value }) => (
                                        <div key={label} className="grid border-b border-border last:border-0 even:bg-background/60 sm:grid-cols-[8rem_minmax(0,1fr)]">
                                            <dt className="bg-paper-tint px-3 py-1 font-bold sm:py-2">{label}</dt>
                                            <dd className="px-3 py-2 [overflow-wrap:anywhere]">{value}</dd>
                                        </div>
                                    ))}
                                </dl>
                            )}
                            {brief && (brief.summary || briefRows.length > 0) && (
                                <p className="text-sm leading-6 text-secondary">公告ページやPDFからAIが読み取った内容です。正式な条件は原本で確認してください。</p>
                            )}
                            {item.description && (
                                <div>
                                    <h3 className="mb-1.5 text-sm font-bold text-accent">AI 案件サマリー</h3>
                                    <p className="whitespace-pre-wrap text-base leading-7 [overflow-wrap:anywhere]">{item.description}</p>
                                </div>
                            )}
                            {!brief?.summary && briefRows.length === 0 && !period && !item.designFirm && !item.description && (
                                <p className="text-sm leading-6 text-secondary">概要は未取得です。詳細は発注元の資料をご確認ください。</p>
                            )}
                            {item.tags && item.tags.length > 0 && (
                                <ul aria-label="案件タグ" className="flex flex-wrap gap-1.5">
                                    {item.tags.map(tag => (
                                        <li key={tag} className="rounded border border-border bg-paper-tint px-2 py-0.5 text-xs font-semibold text-accent [overflow-wrap:anywhere]">#{tag}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </section>

                    <section className="paper-panel p-2">
                        <h2 className="paper-heading">開札・落札情報</h2>
                        <div className="space-y-3 px-2 py-3 sm:px-3">
                            <dl className="overflow-hidden rounded border border-border text-sm sm:text-base">
                                <div className="grid border-b border-border last:border-0 sm:grid-cols-[8rem_minmax(0,1fr)]">
                                    <dt className="bg-paper-tint px-3 py-2 font-bold">落札者</dt>
                                    <dd className="px-3 py-2 font-bold [overflow-wrap:anywhere]">{item.winningContractor || '未取得'}</dd>
                                </div>
                                {price && (
                                    <div className="grid bg-background/60 sm:grid-cols-[8rem_minmax(0,1fr)]">
                                        <dt className="bg-paper-tint px-3 py-2 font-bold">予定価格</dt>
                                        <dd className="px-3 py-2 font-bold tabular-nums [overflow-wrap:anywhere]">{price}</dd>
                                    </div>
                                )}
                            </dl>
                            <div className={`flex gap-2.5 rounded p-3 ${resultAudit.tone === 'warn' ? 'bg-amber-50 text-amber-950' : 'bg-paper-tint text-primary'}`}>
                                {resultAudit.tone === 'ok' ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" /> : <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />}
                                <div>
                                    <h3 className="text-sm font-bold">{resultAudit.title}</h3>
                                    <p className="mt-1 text-sm leading-6">{resultAudit.message}</p>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Link href="/search?quick=missingWinner" className="paper-button">
                                    <Search size={14} aria-hidden="true" /> 落札者未取得を見る
                                </Link>
                                <Link href={isSchoolToilet ? '/search?quick=schoolToilet' : '/search?quick=opened'} className="paper-button">
                                    <Search size={14} aria-hidden="true" /> {isSchoolToilet ? '学校トイレ案件を見る' : '開札済みを見る'}
                                </Link>
                            </div>
                        </div>
                    </section>

                    {detectedMaterials.length > 0 && (
                        <section className="paper-panel p-2">
                            <h2 className="paper-heading">AI 検知資材・部材</h2>
                            <div className="space-y-3 px-2 py-3 sm:px-3">
                                <p className="text-sm leading-6 text-secondary">仕様書PDFや案件サマリーから、使用される可能性のある部材・設備を検知しました。</p>
                                <ul className="grid gap-2 sm:grid-cols-2">
                                    {detectedMaterials.map(m => (
                                        <li key={m.name} className="flex items-start gap-2 rounded border border-border bg-background/60 p-2.5">
                                            <span aria-hidden="true">{m.icon}</span>
                                            <div>
                                                <p className="text-sm font-bold">{m.name}</p>
                                                <p className="mt-0.5 text-xs leading-5 text-secondary">検知キーワード: {m.match}</p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </section>
                    )}
                </div>

                <aside aria-label="資料と関連案件" className="paper-panel space-y-3 p-2">
                    <section>
                        <h2 className="paper-heading">資料</h2>
                        <div className="space-y-2 px-2 py-3">
                            {item.link && (
                                <a href={item.link} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 rounded border border-border bg-background/60 px-3 py-2 text-sm font-semibold hover:bg-paper-tint">
                                    <ExternalLink size={16} className="shrink-0 text-accent" aria-hidden="true" />
                                    公式告示ページ
                                    <span className="ml-auto shrink-0 text-xs text-accent">開く ↗</span>
                                </a>
                            )}
                            {item.pdfUrl && (
                                <a href={item.pdfUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 rounded border border-border bg-background/60 px-3 py-2 text-sm font-semibold hover:bg-paper-tint">
                                    <FileText size={16} className="shrink-0 text-accent" aria-hidden="true" />
                                    掲載資料（PDF）
                                    <span className="ml-auto shrink-0 text-xs text-accent">PDFを開く ↗</span>
                                </a>
                            )}
                            {!sourceUrl && <p className="text-sm leading-6 text-secondary">資料へのリンクは未取得です。</p>}
                        </div>
                    </section>

                    {(item.announcementDate || item.biddingDate) && (
                        <section>
                            <h2 className="paper-heading">案件の日程</h2>
                            <ol className="space-y-3 px-3 py-4">
                                {dates.filter(date => date.value).map(({ label, value }) => (
                                    <li key={label} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                                        <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                                        <span className="font-semibold tabular-nums">{formatDate(value)}</span>
                                        <span className="text-secondary">{label}</span>
                                    </li>
                                ))}
                            </ol>
                        </section>
                    )}

                    {related.length > 0 && (
                        <section>
                            <h2 className="paper-heading">同じ自治体の他の案件</h2>
                            <ul className="px-2 py-2">
                                {related.map(project => (
                                    <li key={project.id} className="rounded even:bg-background/60">
                                        <Link href={`/project/${project.id}`} className="block px-2.5 py-2.5 transition hover:bg-paper-tint">
                                            <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs font-medium text-secondary">
                                                <span className="tabular-nums">{formatDate(project.announcementDate)}</span>
                                                <span className="rounded border border-border bg-surface px-1.5 py-0.5">{statusLabel(displayStatus(project))}</span>
                                            </div>
                                            <p className="mt-1 text-sm font-semibold leading-6 text-accent [overflow-wrap:anywhere]">{project.title}</p>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </aside>
            </div>
        </AppShell>
    );
}

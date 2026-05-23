import { BiddingItem } from '@/types/bidding';
import { AppShell } from '@/components/AppShell';
import { Header } from '@/components/Header';
import { ProjectActionPanel } from '@/components/ProjectActionPanel';
import fs from 'fs';
import path from 'path';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Trophy, Ruler, Calendar, Banknote, FileText, Building2, Clock, Tag, HelpCircle, HardHat, Sparkles } from 'lucide-react';
import { getBiddingLabel } from '@/lib/bidding_schedule';

interface PageProps {
    params: Promise<{ id: string }>;
}

function formatDate(dateStr?: string): string {
    if (!dateStr) return '未設定';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
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
        { name: '外壁改修・防水塗装', icon: '🧱', keywords: ['外壁改修', '防水', '塗装', '屋上防水', 'タイル', 'シーリング'] },
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

export default async function ProjectDetailPage({ params }: PageProps) {
    const { id } = await params;

    // Load data
    const jsonPath = path.join(process.cwd(), 'scraper_result.json');
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

    if (!item) {
        return (
            <AppShell>
                <Header />
                <div className="text-center py-20">
                    <p className="text-3xl tracking-widest mb-4">案件が見つかりません</p>
                    <Link href="/" className="text-accent hover:underline tracking-wider">
                        ダッシュボードに戻る
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

    const detectedMaterials = detectMaterials(item.description);

    return (
        <AppShell>
            <Header />

            {/* Back Link */}
            <Link
                href="/"
                className="inline-flex items-center gap-2 text-secondary/60 hover:text-accent transition-colors text-sm tracking-wider mb-8"
            >
                <ArrowLeft size={14} />
                <span>ダッシュボードに戻る</span>
            </Link>

            {/* Project Action Panel (Sales Progress & Bookmarking) */}
            <ProjectActionPanel item={item} />

            {/* Project Title & Status */}
            <div className="mb-12">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-4">
                    <div className="flex items-start gap-4">
                        <span className={`text-[9px] tracking-[0.2em] border px-3 py-1.5 rounded-sm uppercase font-bold mt-1 shrink-0 ${
                            item.status === '落札' ? 'text-green-600 border-green-200 bg-green-50' :
                            item.status === '受付中' ? 'text-secondary border-secondary/20 bg-secondary/5' :
                            item.status === '締切切迫' ? 'text-amber-600 border-amber-200 bg-amber-50' :
                            'text-gray-300 border-gray-100'
                        }`}>
                            {item.status}
                        </span>
                        <h2 className="text-2xl font-serif tracking-wider leading-relaxed text-primary">{item.title}</h2>
                    </div>
                    <div className="flex flex-wrap gap-3 lg:justify-end shrink-0">
                        {item.pdfUrl && (
                            <a
                                href={item.pdfUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 text-red-700 bg-red-50 border border-red-100 px-4 py-2.5 rounded-md hover:bg-red-100 transition-colors text-xs font-semibold tracking-wider shadow-sm"
                            >
                                <FileText size={14} />
                                <span>仕様書・PDF</span>
                            </a>
                        )}
                        {item.link && (
                            <a
                                href={item.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 text-accent border border-accent/20 bg-white px-4 py-2.5 rounded-md hover:bg-accent/5 transition-colors text-xs font-semibold tracking-wider shadow-sm"
                            >
                                <ExternalLink size={14} />
                                <span>公式告示ページ</span>
                            </a>
                        )}
                    </div>
                </div>
                <p className="text-secondary/50 text-xs tracking-wider ml-16">{item.municipality}</p>
            </div>

            {/* AI Materials Detection (For Subcontractors) */}
            {detectedMaterials.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-r from-blue-50/50 to-indigo-50/20 backdrop-blur-xl border border-blue-100 p-8 rounded-2xl shadow-premium mb-12"
                >
                    <div className="flex items-center gap-3 mb-4 text-blue-700">
                        <Sparkles className="w-5 h-5" />
                        <h3 className="text-xs tracking-[0.25em] font-bold uppercase font-serif">AI 検知資材・部材（下請け向け営業チャンス）</h3>
                    </div>
                    <p className="text-xs text-secondary/60 tracking-wider mb-6">
                        仕様書PDFや案件サマリーから、自社の商材が使われそうな主要な部材・設備カテゴリーをAIが検知しました。元請け（落札ゼネコン）への売込チャンスです！
                    </p>
                    <div className="flex flex-wrap gap-4">
                        {detectedMaterials.map((m) => (
                            <div
                                key={m.name}
                                className="bg-white border border-blue-200/50 px-4 py-3 rounded-xl flex items-center gap-3 shadow-sm hover:border-blue-300 transition-all"
                            >
                                <span className="text-xl">{m.icon}</span>
                                <div>
                                    <h5 className="text-xs font-bold text-primary font-serif">{m.name}</h5>
                                    <p className="text-[10px] text-secondary/40 font-mono mt-0.5">検知キーワード: &quot;{m.match}&quot;</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* Summary Panel */}
            <div className="bg-white/80 backdrop-blur-xl shadow-premium p-8 rounded-lg border border-white/50 mb-12">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                    <div className="flex items-start gap-3">
                        <Building2 className="w-5 h-5 text-accent mt-0.5" />
                        <div>
                            <p className="text-[9px] tracking-[0.2em] text-secondary/40 uppercase mb-1">自治体 / 種別</p>
                            <p className="text-sm tracking-wider font-semibold">{item.municipality} / {item.type}</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <Clock className="w-5 h-5 text-accent mt-0.5" />
                        <div>
                            <p className="text-[9px] tracking-[0.2em] text-secondary/40 uppercase mb-1">公告日</p>
                            <p className="text-sm tracking-wider font-semibold">{formatDate(item.announcementDate)}</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <Calendar className="w-5 h-5 text-accent mt-0.5" />
                        <div>
                            <p className="text-[9px] tracking-[0.2em] text-secondary/40 uppercase mb-1">{getBiddingLabel(item)}</p>
                            <p className="text-sm tracking-wider font-semibold">{formatDate(item.biddingDate)}</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <FileText className="w-5 h-5 text-accent mt-0.5" />
                        <div>
                            <p className="text-[9px] tracking-[0.2em] text-secondary/40 uppercase mb-1">資料</p>
                            <p className="text-sm tracking-wider font-semibold">{item.pdfUrl ? '仕様書PDFあり' : '公式ホームページのみ'}</p>
                        </div>
                    </div>
                </div>
                {item.tags && item.tags.length > 0 && (
                    <div className="flex items-center gap-2 mt-8 pt-6 border-t border-border/30">
                        <Tag className="w-4 h-4 text-secondary/40" />
                        <div className="flex flex-wrap gap-2">
                            {item.tags.map(tag => (
                                <span key={tag} className="text-[10px] bg-blue-50 text-blue-600 px-2.5 py-0.5 rounded-full border border-blue-100 font-bold tracking-wider">
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                {/* Intelligence Cards */}
                {item.winningContractor && (
                    <div className="bg-white/80 backdrop-blur-xl shadow-premium p-8 rounded-2xl border border-green-100">
                        <div className="flex items-center gap-3 mb-3">
                            <Trophy className="w-5 h-5 text-green-600" />
                            <span className="text-[10px] tracking-[0.3em] text-green-600/70 uppercase font-bold">落札業者（元請け）</span>
                        </div>
                        <p className="text-xl font-serif font-bold tracking-wider text-green-800">{item.winningContractor}</p>
                        <p className="text-xs text-green-600/60 tracking-wider mt-2">
                            ※下請けメーカーはこの落札ゼネコンへ資材や専門工事のアプローチを行いましょう。
                        </p>
                    </div>
                )}

                {item.designFirm && (
                    <div className="bg-white/80 backdrop-blur-xl shadow-premium p-8 rounded-2xl border border-blue-100">
                        <div className="flex items-center gap-3 mb-3">
                            <Ruler className="w-5 h-5 text-blue-600" />
                            <span className="text-[10px] tracking-[0.3em] text-blue-600/70 uppercase font-bold">設計事務所</span>
                        </div>
                        <p className="text-xl font-serif font-bold tracking-wider text-blue-800">{item.designFirm}</p>
                    </div>
                )}

                {item.estimatedPrice && (
                    <div className="bg-white/80 backdrop-blur-xl shadow-premium p-8 rounded-2xl border border-slate-100">
                        <div className="flex items-center gap-3 mb-3">
                            <Banknote className="w-5 h-5 text-accent" />
                            <span className="text-[10px] tracking-[0.3em] text-secondary/50 uppercase font-bold">予定価格</span>
                        </div>
                        <p className="text-xl font-serif font-bold tracking-wider text-primary">{item.estimatedPrice}</p>
                    </div>
                )}

                {item.constructionPeriod && (
                    <div className="bg-white/80 backdrop-blur-xl shadow-premium p-8 rounded-2xl border border-slate-100">
                        <div className="flex items-center gap-3 mb-3">
                            <Calendar className="w-5 h-5 text-accent" />
                            <span className="text-[10px] tracking-[0.3em] text-secondary/50 uppercase font-bold">工期</span>
                        </div>
                        <p className="text-xl font-serif font-bold tracking-wider text-primary">{item.constructionPeriod}</p>
                    </div>
                )}
            </div>

            {/* Description */}
            {item.description && (
                <div className="bg-white/80 backdrop-blur-xl shadow-premium p-8 rounded-2xl border border-white/50 mb-12">
                    <h3 className="text-[10px] tracking-[0.3em] text-secondary/50 uppercase font-bold mb-4">AI 案件サマリー</h3>
                    <p className="text-sm leading-relaxed text-secondary tracking-wider whitespace-pre-wrap">{item.description}</p>
                </div>
            )}

            {/* Related Projects */}
            {related.length > 0 && (
                <div className="mt-16">
                    <h3 className="text-[10px] tracking-[0.3em] text-secondary/50 uppercase font-bold mb-6">
                        同じ自治体の他の案件
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {related.map((r) => (
                            <Link
                                key={r.id}
                                href={`/project/${r.id}`}
                                className="bg-white/80 backdrop-blur-xl shadow-premium p-6 rounded-xl border border-white/50 hover:border-accent/30 transition-all group"
                            >
                                <span className={`text-[8px] tracking-[0.2em] border px-2 py-0.5 rounded-sm uppercase font-bold ${
                                    r.status === '落札' ? 'text-green-600 border-green-200' :
                                    r.status === '受付中' ? 'text-secondary border-secondary/20' :
                                    'text-gray-300 border-gray-100'
                                }`}>
                                    {r.status}
                                </span>
                                <p className="text-sm font-serif font-semibold tracking-wider mt-3 group-hover:text-accent transition-colors truncate">
                                    {r.title}
                                </p>
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </AppShell>
    );
}

import { BiddingItem } from '@/types/bidding';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import fs from 'fs';
import path from 'path';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Trophy, Ruler, Calendar, Banknote, FileText, Building2, Clock, Tag } from 'lucide-react';

interface PageProps {
    params: Promise<{ id: string }>;
}

function formatDate(dateStr?: string): string {
    if (!dateStr) return '未設定';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
}

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
        // エラー時はnullを返す
    }

    if (!item) {
        return (
            <div className="flex min-h-screen bg-background text-primary font-serif">
                <Sidebar />
                <main className="flex-1 ml-64 p-16">
                    <Header />
                    <div className="text-center py-20">
                        <p className="text-3xl tracking-widest mb-4">案件が見つかりません</p>
                        <Link href="/" className="text-accent hover:underline tracking-wider">
                            ダッシュボードに戻る
                        </Link>
                    </div>
                </main>
            </div>
        );
    }

    // Related items (same municipality, different ID)
    const related = allItems
        .filter(i => i.municipality === item!.municipality && i.id !== item!.id)
        .sort((a, b) => new Date(b.announcementDate).getTime() - new Date(a.announcementDate).getTime())
        .slice(0, 3);

    return (
        <div className="flex min-h-screen bg-background text-primary font-serif">
            <Sidebar />
            <main className="flex-1 ml-64 p-16">
                <Header />

                {/* Back Link */}
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 text-secondary/60 hover:text-accent transition-colors text-sm tracking-wider mb-8"
                >
                    <ArrowLeft size={14} />
                    <span>ダッシュボードに戻る</span>
                </Link>

                {/* Project Title & Status */}
                <div className="mb-12">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-4">
                        <div className="flex items-start gap-4">
                        <span className={`text-[9px] tracking-[0.2em] border px-3 py-1.5 rounded-sm uppercase font-bold mt-1 ${item.status === '落札' ? 'text-green-600 border-green-200 bg-green-50' :
                                item.status === '受付中' ? 'text-secondary border-secondary/20 bg-secondary/5' :
                                    item.status === '締切間近' ? 'text-amber-600 border-amber-200 bg-amber-50' :
                                        'text-gray-300 border-gray-100'
                            }`}>
                            {item.status}
                        </span>
                        <h2 className="text-2xl tracking-wider leading-relaxed">{item.title}</h2>
                        </div>
                        <div className="flex flex-wrap gap-3 lg:justify-end">
                            {item.pdfUrl && (
                                <a
                                    href={item.pdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 text-red-700 bg-red-50 border border-red-100 px-4 py-2 rounded-md hover:bg-red-100 transition-colors text-xs tracking-wider"
                                >
                                    <FileText size={14} />
                                    <span>PDF</span>
                                </a>
                            )}
                            {item.link && (
                                <a
                                    href={item.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 text-accent border border-accent/20 px-4 py-2 rounded-md hover:bg-accent/5 transition-colors text-xs tracking-wider"
                                >
                                    <ExternalLink size={14} />
                                    <span>公式ページ</span>
                                </a>
                            )}
                        </div>
                    </div>
                    <p className="text-secondary/50 text-sm tracking-wider ml-16">{item.municipality}</p>
                </div>

                {/* Summary Panel */}
                <div className="bg-white/80 backdrop-blur-xl shadow-premium p-8 rounded-lg border border-white/50 mb-12">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                        <div className="flex items-start gap-3">
                            <Building2 className="w-5 h-5 text-accent mt-0.5" />
                            <div>
                                <p className="text-[9px] tracking-[0.2em] text-secondary/40 uppercase mb-1">自治体 / 種別</p>
                                <p className="text-sm tracking-wider">{item.municipality} / {item.type}</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <Calendar className="w-5 h-5 text-accent mt-0.5" />
                            <div>
                                <p className="text-[9px] tracking-[0.2em] text-secondary/40 uppercase mb-1">公告日</p>
                                <p className="text-sm tracking-wider">{formatDate(item.announcementDate)}</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <Clock className="w-5 h-5 text-accent mt-0.5" />
                            <div>
                                <p className="text-[9px] tracking-[0.2em] text-secondary/40 uppercase mb-1">入札日</p>
                                <p className="text-sm tracking-wider">{formatDate(item.biddingDate)}</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <FileText className="w-5 h-5 text-accent mt-0.5" />
                            <div>
                                <p className="text-[9px] tracking-[0.2em] text-secondary/40 uppercase mb-1">資料</p>
                                <p className="text-sm tracking-wider">{item.pdfUrl ? 'PDFあり' : '公式ページのみ'}</p>
                            </div>
                        </div>
                    </div>
                    {item.tags && item.tags.length > 0 && (
                        <div className="flex items-center gap-2 mt-8 pt-6 border-t border-border/30">
                            <Tag className="w-4 h-4 text-secondary/40" />
                            <div className="flex flex-wrap gap-2">
                                {item.tags.map(tag => (
                                    <span key={tag} className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100 font-bold tracking-wider">
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
                        <div className="bg-white/80 backdrop-blur-xl shadow-premium p-8 rounded-lg border border-green-100">
                            <div className="flex items-center gap-3 mb-3">
                                <Trophy className="w-5 h-5 text-green-600" />
                                <span className="text-[10px] tracking-[0.3em] text-green-600/70 uppercase font-bold">落札業者</span>
                            </div>
                            <p className="text-xl tracking-wider">{item.winningContractor}</p>
                        </div>
                    )}

                    {item.designFirm && (
                        <div className="bg-white/80 backdrop-blur-xl shadow-premium p-8 rounded-lg border border-blue-100">
                            <div className="flex items-center gap-3 mb-3">
                                <Ruler className="w-5 h-5 text-blue-600" />
                                <span className="text-[10px] tracking-[0.3em] text-blue-600/70 uppercase font-bold">設計事務所</span>
                            </div>
                            <p className="text-xl tracking-wider">{item.designFirm}</p>
                        </div>
                    )}

                    {item.estimatedPrice && (
                        <div className="bg-white/80 backdrop-blur-xl shadow-premium p-8 rounded-lg border border-white/50">
                            <div className="flex items-center gap-3 mb-3">
                                <Banknote className="w-5 h-5 text-accent" />
                                <span className="text-[10px] tracking-[0.3em] text-secondary/50 uppercase font-bold">予定価格</span>
                            </div>
                            <p className="text-xl tracking-wider">{item.estimatedPrice}</p>
                        </div>
                    )}

                    {item.constructionPeriod && (
                        <div className="bg-white/80 backdrop-blur-xl shadow-premium p-8 rounded-lg border border-white/50">
                            <div className="flex items-center gap-3 mb-3">
                                <Calendar className="w-5 h-5 text-accent" />
                                <span className="text-[10px] tracking-[0.3em] text-secondary/50 uppercase font-bold">工期</span>
                            </div>
                            <p className="text-xl tracking-wider">{item.constructionPeriod}</p>
                        </div>
                    )}
                </div>

                {/* Metadata */}
                <div className="bg-white/80 backdrop-blur-xl shadow-premium p-8 rounded-lg border border-white/50 mb-12">
                    <h3 className="text-[10px] tracking-[0.3em] text-secondary/50 uppercase font-bold mb-6">案件情報</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6">
                        <div>
                            <p className="text-[9px] tracking-[0.2em] text-secondary/40 uppercase mb-1">自治体</p>
                            <p className="text-sm tracking-wider">{item.municipality}</p>
                        </div>
                        <div>
                            <p className="text-[9px] tracking-[0.2em] text-secondary/40 uppercase mb-1">種別</p>
                            <p className="text-sm tracking-wider">{item.type}</p>
                        </div>
                        <div>
                            <p className="text-[9px] tracking-[0.2em] text-secondary/40 uppercase mb-1">公告日</p>
                            <p className="text-sm tracking-wider">{formatDate(item.announcementDate)}</p>
                        </div>
                        <div>
                            <p className="text-[9px] tracking-[0.2em] text-secondary/40 uppercase mb-1">入札日</p>
                            <p className="text-sm tracking-wider">{formatDate(item.biddingDate)}</p>
                        </div>
                    </div>
                </div>

                {/* Description */}
                {item.description && (
                    <div className="bg-white/80 backdrop-blur-xl shadow-premium p-8 rounded-lg border border-white/50 mb-12">
                        <h3 className="text-[10px] tracking-[0.3em] text-secondary/50 uppercase font-bold mb-4">AI分析サマリー</h3>
                        <p className="text-sm leading-relaxed text-secondary tracking-wider">{item.description}</p>
                    </div>
                )}

                {/* Related Projects */}
                {related.length > 0 && (
                    <div className="mt-16">
                        <h3 className="text-[10px] tracking-[0.3em] text-secondary/50 uppercase font-bold mb-6">
                            同じ自治体の案件
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {related.map((r) => (
                                <Link
                                    key={r.id}
                                    href={`/project/${r.id}`}
                                    className="bg-white/80 backdrop-blur-xl shadow-premium p-6 rounded-lg border border-white/50 hover:border-accent/30 transition-all group"
                                >
                                    <span className={`text-[8px] tracking-[0.2em] border px-2 py-0.5 rounded-sm uppercase font-bold ${r.status === '落札' ? 'text-green-600 border-green-200' :
                                            r.status === '受付中' ? 'text-secondary border-secondary/20' :
                                                'text-gray-300 border-gray-100'
                                        }`}>
                                        {r.status}
                                    </span>
                                    <p className="text-sm tracking-wider mt-3 group-hover:text-accent transition-colors truncate">
                                        {r.title}
                                    </p>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

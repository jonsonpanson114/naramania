'use client';

import { useState, useEffect } from 'react';
import { AppShell } from '@/components/AppShell';
import { Header } from '@/components/Header';
import { motion } from 'framer-motion';
import { CheckCircle, MessageSquareText, Bell, Tag } from 'lucide-react';

const availableMunicipalities = [
    // 県・市
    { id: 'nara_pref', label: '奈良県', enabled: true },
    { id: 'nara_city', label: '奈良市', enabled: true },
    { id: 'kashihara', label: '橿原市', enabled: true },
    { id: 'yamatotakada', label: '大和高田市', enabled: true },
    { id: 'yamatokoriyama', label: '大和郡山市', enabled: true },
    { id: 'tenri', label: '天理市', enabled: true },
    { id: 'sakurai', label: '桜井市', enabled: true },
    { id: 'gose', label: '御所市', enabled: true },
    { id: 'ikoma', label: '生駒市', enabled: true },
    { id: 'katsuragi', label: '葛城市', enabled: true },
    { id: 'uda', label: '宇陀市', enabled: true },
    { id: 'gojo', label: '五條市', enabled: true },
    // 町・村
    { id: 'kawanishi', label: '磯城郡川西町', enabled: true },
    { id: 'tawaramoto', label: '磯城郡田原本町', enabled: true },
    { id: 'oji', label: '北葛城郡王寺町', enabled: true },
    { id: 'koryo', label: '北葛城郡広陵町', enabled: true },
    { id: 'oyodo', label: '吉野郡大淀町', enabled: true },
    { id: 'yoshino', label: '吉野町', enabled: true },
];

export default function SettingsPage() {
    const [municipalities, setMunicipalities] = useState(() => {
        if (typeof window === 'undefined') {
            return availableMunicipalities;
        }
        const stored = localStorage.getItem('naramania_settings');
        if (!stored) {
            return availableMunicipalities;
        }
        try {
            const settings = JSON.parse(stored);
            return settings.municipalities || availableMunicipalities;
        } catch {
            return availableMunicipalities;
        }
    });

    const [itemsPerPage, setItemsPerPage] = useState(() => {
        if (typeof window === 'undefined') {
            return 20;
        }
        const stored = localStorage.getItem('naramania_settings');
        if (!stored) {
            return 20;
        }
        try {
            const settings = JSON.parse(stored);
            return settings.itemsPerPage || 20;
        } catch {
            return 20;
        }
    });

    const [alertKeywords, setAlertKeywords] = useState(() => {
        if (typeof window === 'undefined') {
            return 'サッシ, 空調, エレベーター';
        }
        const stored = localStorage.getItem('naramania_alert_keywords');
        return stored || 'サッシ, 空調, エレベーター';
    });

    const [saved, setSaved] = useState(false);

    const toggleMunicipality = (id: string) => {
        setMunicipalities((prev: any[]) =>
            prev.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m)
        );
        setSaved(false);
    };

    const saveSettings = () => {
        const settings = { municipalities, itemsPerPage };
        localStorage.setItem('naramania_settings', JSON.stringify(settings));
        localStorage.setItem('naramania_alert_keywords', alertKeywords);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <AppShell>
            <Header />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
            >
                <h2 className="text-3xl tracking-widest mb-4 font-serif">設定</h2>
                <p className="text-secondary/60 text-sm tracking-wider mb-12">
                    対象自治体や、アラート通知用の商材キーワードを変更できます。
                </p>
            </motion.div>

            {/* Target Municipalities */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="bg-white/80 backdrop-blur-xl shadow-premium p-8 rounded-lg border border-white/50 mb-8"
            >
                <h3 className="text-[10px] tracking-[0.3em] text-secondary/50 uppercase font-bold mb-6">対象自治体</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {municipalities.map((m: any) => (
                        <button
                            key={m.id}
                            onClick={() => toggleMunicipality(m.id)}
                            className={`p-4 rounded-md border text-sm tracking-wider transition-all cursor-pointer ${
                                m.enabled
                                    ? 'bg-accent/5 border-accent/30 text-accent font-semibold'
                                    : 'bg-white/50 border-border/20 text-secondary/40 hover:border-accent/20'
                            }`}
                        >
                            <span className="text-lg block mb-1">{m.enabled ? '✓' : '＋'}</span>
                            {m.label}
                        </button>
                    ))}
                </div>
            </motion.div>

            {/* Alert Keywords Settings */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15 }}
                className="bg-white/80 backdrop-blur-xl shadow-premium p-8 rounded-lg border border-white/50 mb-8"
            >
                <div className="flex items-center gap-3 mb-4">
                    <Bell className="w-5 h-5 text-accent" />
                    <h3 className="text-[10px] tracking-[0.3em] text-secondary/50 uppercase font-bold">商材アラート通知設定</h3>
                </div>
                <p className="text-xs text-secondary/50 tracking-wider mb-6 leading-relaxed">
                    自社で取り扱っている資材や部材のキーワードを登録すると、仕様書PDFや案件の要約にその言葉が含まれる新着物件（過去7日以内）があった際に、ダッシュボード上にリアルタイムにアラートが表示されます。
                </p>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-secondary mb-2 tracking-wider">監視する商材キーワード（カンマ区切り）</label>
                        <input
                            type="text"
                            value={alertKeywords}
                            onChange={(e) => { setAlertKeywords(e.target.value); setSaved(false); }}
                            placeholder="サッシ, 空調, 照明, エレベーター, 塗料"
                            className="w-full px-4 py-3 border border-border/30 rounded-md bg-white/50 text-sm tracking-wider focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all font-sans"
                        />
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                        {alertKeywords.split(',').map(kw => kw.trim()).filter(Boolean).map(kw => (
                            <span key={kw} className="text-[10px] bg-accent/5 text-accent border border-accent/20 px-2.5 py-1 rounded-full font-bold tracking-wider flex items-center gap-1.5 shadow-sm">
                                <Tag size={10} />
                                {kw}
                            </span>
                        ))}
                    </div>
                </div>
            </motion.div>

            {/* Display Settings */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="bg-white/80 backdrop-blur-xl shadow-premium p-8 rounded-lg border border-white/50 mb-8"
            >
                <h3 className="text-[10px] tracking-[0.3em] text-secondary/50 uppercase font-bold mb-6">表示設定</h3>
                <div className="flex items-center gap-6">
                    <label className="text-sm tracking-wider text-secondary">1ページあたりの表示件数</label>
                    <select
                        value={itemsPerPage}
                        onChange={(e) => { setItemsPerPage(Number(e.target.value)); setSaved(false); }}
                        className="border border-border/30 rounded-md px-4 py-2 bg-white/50 text-sm tracking-wider font-serif focus:outline-none focus:border-accent appearance-none cursor-pointer"
                    >
                        <option value={10}>10件</option>
                        <option value={20}>20件</option>
                        <option value={50}>50件</option>
                        <option value={100}>100件</option>
                    </select>
                </div>
            </motion.div>

            {/* AI Model Info */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="bg-white/80 backdrop-blur-xl shadow-premium p-8 rounded-lg border border-white/50 mb-12"
            >
                <h3 className="text-[10px] tracking-[0.3em] text-secondary/50 uppercase font-bold mb-6">AI解析エンジン</h3>
                <div className="flex items-center gap-4">
                    <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse"></div>
                    <span className="text-sm tracking-wider">Gemini 3.1 Flash-Lite</span>
                    <span className="text-[9px] tracking-[0.2em] text-green-600 border border-green-200 bg-green-50 px-2 py-0.5 rounded-sm uppercase font-bold">Active</span>
                </div>
                <p className="text-secondary/40 text-xs tracking-wider mt-3">
                    入札結果PDFから落札業者・設計事務所・金額を自動抽出します。
                </p>
                <div className="mt-6 rounded-md border border-border/40 bg-sidebar/50 p-4">
                    <div className="flex items-center gap-2 text-sm tracking-wider text-primary">
                        <MessageSquareText size={16} className="text-accent" />
                        <span>入札チャットもこの API キーを利用します</span>
                    </div>
                    <p className="mt-3 text-xs leading-6 tracking-wider text-secondary/55">
                        Vercel の Project Settings {'>'} Environment Variables に
                        <span className="mx-1 font-semibold text-primary">GOOGLE_GENERATIVE_AI_API_KEY</span>
                        を設定すると、サイトの案件検索と Web 補足付きチャットが動きます。
                    </p>
                </div>
            </motion.div>

            {/* Save Button */}
            <div className="flex items-center gap-4">
                <button
                    onClick={saveSettings}
                    className="bg-accent text-white px-8 py-3 rounded-md text-sm tracking-widest hover:bg-accent/90 transition-colors cursor-pointer shadow-lg"
                >
                    設定を保存
                </button>
                {saved && (
                    <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-2 text-green-600 text-sm tracking-wider"
                    >
                        <CheckCircle size={16} />
                        <span>保存しました</span>
                    </motion.div>
                )}
            </div>
        </AppShell>
    );
}

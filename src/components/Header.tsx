'use client';

import { motion } from 'framer-motion';

export function Header() {
    const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });

    return (
        <header className="mb-8 px-1 md:px-4">
            <div>
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-4 mb-3"
                >
                    <p className="text-[10px] text-accent tracking-[0.3em] font-semibold uppercase">{today}</p>
                    <div className="flex items-center gap-2 px-2 py-0.5 border border-secondary/20 rounded-full">
                        <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-secondary"></span>
                        </span>
                        <span className="text-[8px] text-secondary tracking-widest uppercase font-bold">Live Data</span>
                    </div>
                </motion.div>
                <motion.h2
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-3xl font-light text-primary tracking-[0.08em] font-serif md:text-4xl"
                >
                    奈良入札ダッシュボード
                </motion.h2>
                <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.18 }}
                    className="mt-3 max-w-2xl text-sm leading-7 tracking-[0.05em] text-secondary/65"
                >
                    まず受付中と直近開札を確認し、必要なら市町村別の状況や監査情報へ進めます。
                </motion.p>
            </div>
        </header>
    );
}

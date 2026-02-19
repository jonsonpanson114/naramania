'use client';

import { Search } from 'lucide-react';
import { motion } from 'framer-motion';

export function Header() {
    const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });

    return (
        <header className="flex justify-between items-end mb-16 px-4">
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
                    className="text-4xl font-light text-primary tracking-[0.1em] font-serif"
                >
                    案件情報一覧
                </motion.h2>
            </div>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="flex items-center gap-8"
            >
                <div className="relative group">
                    <input
                        type="text"
                        placeholder="案件を検索..."
                        className="bg-transparent border-b border-border py-2 pl-0 pr-10 focus:outline-none focus:border-accent w-64 text-sm transition text-primary placeholder-gray-400 font-serif tracking-wider"
                    />
                    <Search className="absolute right-0 top-3 text-gray-400 group-hover:text-accent transition-colors duration-300" size={16} />
                </div>
            </motion.div>
        </header>
    );
}

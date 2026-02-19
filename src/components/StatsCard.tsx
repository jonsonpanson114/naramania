'use client';

import { motion } from 'framer-motion';

interface StatsCardProps {
    label: string;
    value: number;
    unit: string;
    subtext: string;
    delay?: number;
}

export function StatsCard({ label, value, unit, subtext, delay = 0 }: StatsCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay }}
            whileHover={{ y: -5, boxShadow: '0 20px 40px -20px rgba(0,0,0,0.1)' }}
            className="bg-white p-8 relative shadow-soft border border-white hover:border-accent/10 transition-colors duration-500 rounded-sm overflow-hidden"
        >
            {/* Background Accent Gradient */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-radial-gradient from-accent/5 to-transparent -mr-16 -mt-16 pointer-events-none" />

            <p className="text-secondary text-[10px] tracking-[0.2em] mb-4 font-serif uppercase opacity-70">{label}</p>
            <div className="flex items-end gap-3">
                <h3 className="text-5xl font-serif text-primary font-light tracking-tighter tabular-nums">{value}</h3>
                <span className="text-[10px] text-accent mb-2 tracking-[0.3em] font-serif uppercase">{unit}</span>
            </div>
            <div className="flex items-center gap-2 mt-4">
                <span className="w-1 h-1 bg-accent rounded-full animate-pulse"></span>
                <p className="text-[9px] text-gray-400 tracking-widest font-sans uppercase">{subtext}</p>
            </div>
        </motion.div>
    );
}

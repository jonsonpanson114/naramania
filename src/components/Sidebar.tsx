'use client';

import { LayoutDashboard, Search, Briefcase, Settings, MessageSquareText, ChartColumn, Wrench } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
    { href: '/', label: 'ダッシュボード', icon: LayoutDashboard },
    { href: '/search', label: '案件検索', icon: Search },
    { href: '/analytics', label: '分析', icon: ChartColumn },
    { href: '/saved', label: '営業管理', icon: Briefcase },
    { href: '/chat', label: '入札チャット', icon: MessageSquareText },
    { href: '/settings', label: '設定', icon: Settings },
];

export function Sidebar() {
    const pathname = usePathname();

    return (
        <>
        <aside className="hidden w-56 bg-sidebar h-screen lg:flex flex-col fixed left-0 top-0 z-20 border-r border-border font-serif">
            <div className="px-8 py-9 flex flex-col items-center gap-4 mb-1">
                <Link href="/" className="flex flex-col items-center gap-4 hover:opacity-80 transition-opacity">
                    <div className="w-12 h-12 flex items-center justify-center border border-accent/30 rotate-45">
                        <div className="w-10 h-10 border border-accent/30 flex items-center justify-center -rotate-45">
                            <span className="text-xl text-accent font-serif">N</span>
                        </div>
                    </div>
                    <div className="text-center">
                        <h1 className="text-base tracking-widest text-primary font-serif">奈良入札情報</h1>
                    </div>
                </Link>
            </div>

            <div className="w-1/2 mx-auto mb-6 h-px bg-gradient-to-r from-transparent via-accent to-transparent opacity-30"></div>

            <nav className="flex-1 px-5 space-y-1.5 text-center">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`block text-[13px] tracking-widest cursor-pointer py-3 px-3 rounded-xl flex items-center justify-start gap-3 transition-all duration-300 ${isActive
                                ? 'text-accent font-semibold bg-accent/5 border-b-2 border-accent'
                                : 'text-secondary hover:text-accent hover:bg-accent/5'
                                }`}
                        >
                            <Icon size={16} />
                            <span>{item.label}</span>
                        </Link>
                    );
                })}
            </nav>

            <div className="p-5">
                <Link
                    href="/admin"
                    className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[11px] tracking-widest transition-all ${pathname === '/admin'
                        ? 'text-accent bg-accent/5'
                        : 'text-secondary/50 hover:text-accent hover:bg-accent/5'
                    }`}
                >
                    <Wrench size={13} />
                    <span>運用状況</span>
                </Link>
            </div>
        </aside>
        <nav className="fixed inset-x-0 top-0 z-30 flex items-center gap-3 overflow-x-auto border-b border-border bg-sidebar/95 px-4 py-3 font-serif backdrop-blur lg:hidden">
            <Link href="/" className="mr-1 flex shrink-0 items-center gap-2 pr-2">
                <div className="flex h-8 w-8 rotate-45 items-center justify-center border border-accent/30">
                    <span className="-rotate-45 text-sm text-accent font-serif">N</span>
                </div>
                <span className="whitespace-nowrap text-xs font-bold tracking-widest text-primary">奈良入札</span>
            </Link>
            {navItems.map((item) => {
                const isActive = item.href === '/' ? pathname === '/' : pathname === item.href;
                const Icon = item.icon;
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-2 text-[10px] tracking-wider transition-all ${isActive
                            ? 'border-accent/30 bg-accent/10 text-accent'
                            : 'border-transparent text-secondary hover:border-accent/20 hover:text-accent'
                            }`}
                    >
                        <Icon size={14} />
                        <span>{item.label}</span>
                    </Link>
                );
            })}
        </nav>
        </>
    );
}

'use client';

import { LayoutDashboard, Search, Bookmark, Settings, Trophy, Radar } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
    { href: '/', label: 'ダッシュボード', icon: LayoutDashboard },
    { href: '/search', label: '案件検索', icon: Search },
    { href: '/rankings', label: '実績ランキング', icon: Trophy },
    { href: '/radar', label: '相場レーダー', icon: Radar },
    { href: '/saved', label: '保存済み', icon: Bookmark },
    { href: '/settings', label: '設定', icon: Settings },
];

export function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="w-64 bg-sidebar h-screen flex flex-col fixed left-0 top-0 z-20 border-r border-border font-serif">
            <div className="p-10 flex flex-col items-center gap-4 mb-2">
                <Link href="/" className="flex flex-col items-center gap-4 hover:opacity-80 transition-opacity">
                    <div className="w-14 h-14 flex items-center justify-center border border-accent/30 rotate-45">
                        <div className="w-12 h-12 border border-accent/30 flex items-center justify-center -rotate-45">
                            <span className="text-2xl text-accent font-serif">N</span>
                        </div>
                    </div>
                    <div className="text-center">
                        <h1 className="text-lg tracking-widest text-primary font-serif">奈良入札情報</h1>
                    </div>
                </Link>
            </div>

            <div className="w-1/2 mx-auto mb-8 h-px bg-gradient-to-r from-transparent via-accent to-transparent opacity-30"></div>

            <nav className="flex-1 px-8 space-y-2 text-center">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`block text-sm tracking-widest cursor-pointer py-3 px-4 rounded-md flex items-center justify-center gap-3 transition-all duration-300 ${isActive
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

            <div className="p-8 text-center">
                <div className="inline-block relative">
                    <img
                        src="https://ui-avatars.com/api/?name=User&background=c5a059&color=fff"
                        alt="User"
                        className="w-10 h-10 rounded-full mx-auto mb-2 opacity-90 object-cover"
                    />
                    <div className="w-full h-full absolute top-0 left-0 rounded-full border border-accent/20 scale-125"></div>
                </div>
                <p className="text-xs text-primary mt-3 tracking-widest font-serif">山田 太郎</p>
            </div>
        </aside>
    );
}

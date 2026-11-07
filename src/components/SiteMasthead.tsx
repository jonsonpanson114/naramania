'use client';

import { Ellipsis } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const primaryLinks = [
    { href: '/', label: '今日' },
    { href: '/search', label: '案件検索' },
    { href: '/analytics', label: '分析' },
    { href: '/saved', label: '営業管理' },
    { href: '/news', label: 'ニュース' },
];

const secondaryLinks = [
    { href: '/market', label: '市場全体' },
    { href: '/design-map', label: '設計案件マップ' },
    { href: '/chat', label: '入札チャット' },
    { href: '/sources', label: '収集元サイト' },
    { href: '/settings', label: '設定' },
    { href: '/admin', label: '運用状況' },
];

interface SiteMastheadProps {
    date: string;
    updatedAt?: string | null;
}

const updateFormatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
});

export function SiteMasthead({ date, updatedAt }: SiteMastheadProps) {
    const pathname = usePathname();
    const searchDetail = pathname.startsWith('/project/');
    const currentArea = searchDetail ? '/search' : pathname;
    const updateDate = updatedAt ? new Date(updatedAt) : null;
    const formattedUpdate = updateDate && Number.isFinite(updateDate.getTime()) ? updateFormatter.format(updateDate) : null;

    return (
        <header className="masthead">
            <div className="masthead-inner">
                <div className="masthead-top">
                    <Link href="/" className="masthead-brand" aria-label="naramania ホーム">
                        <span>naramania</span>
                    </Link>
                    <p className="masthead-tagline">奈良の建築・入札を読む</p>
                    <div className="masthead-edition">
                        {formattedUpdate && (
                            <time dateTime={updatedAt ?? undefined} className="masthead-update">
                                最終更新 {formattedUpdate}
                            </time>
                        )}
                        <span className="masthead-date">{date}</span>
                    </div>
                </div>
                <div className="masthead-bar">
                    <nav className="masthead-nav" aria-label="メインメニュー">
                        {primaryLinks.map(({ href, label }) => (
                            <Link
                                key={href}
                                href={href}
                                aria-current={currentArea === href ? searchDetail ? 'location' : 'page' : undefined}
                            >
                                {label}
                            </Link>
                        ))}
                        <details key={pathname} className="masthead-more">
                            <summary aria-label="その他のページ" className={secondaryLinks.some(({ href }) => href === pathname) ? 'is-current' : undefined}>
                                <Ellipsis size={20} aria-hidden />
                            </summary>
                            <ul className="masthead-menu">
                                {secondaryLinks.map(({ href, label }) => (
                                    <li key={href}>
                                        <Link href={href} aria-current={href === pathname ? 'page' : undefined}>{label}</Link>
                                    </li>
                                ))}
                            </ul>
                        </details>
                    </nav>
                </div>
            </div>
        </header>
    );
}

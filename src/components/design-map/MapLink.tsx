import Link from 'next/link';

interface MapLinkProps {
    href: string;
    children: React.ReactNode;
}

/** 奈良マニア内の案件は同じタブで、外部の資料は新しいタブで開く */
export function MapLink({ href, children }: MapLinkProps) {
    if (href.startsWith('/')) {
        return <Link href={href}>{children}</Link>;
    }
    return (
        <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
        </a>
    );
}

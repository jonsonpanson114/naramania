import { SiteMasthead } from '@/components/SiteMasthead';
import { formatJstDateLabel } from '@/lib/jst_date';

interface AppShellProps {
    children: React.ReactNode;
    updatedAt?: string | null;
}

export function AppShell({ children, updatedAt }: AppShellProps) {
    return (
        <div className="min-h-screen bg-background text-primary">
            <SiteMasthead date={formatJstDateLabel()} updatedAt={updatedAt} />
            <main className="paper-content" id="main-content">
                {children}
            </main>
        </div>
    );
}

import { Sidebar } from '@/components/Sidebar';

interface AppShellProps {
    children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
    return (
        <div className="flex min-h-screen bg-background text-primary font-serif">
            <Sidebar />
            <main className="w-full flex-1 px-4 py-6 pt-24 md:px-8 lg:ml-56 lg:p-10 xl:p-12">
                {children}
            </main>
        </div>
    );
}

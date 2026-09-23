export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-bg-main text-text-main">
            <nav className="border-b border-blue-100 bg-white shadow-sm p-4 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-primary font-bold text-xl drop-shadow-sm">LUCKY DRAW ADMIN</span>
                        <span className="bg-secondary/10 text-secondary px-2 py-0.5 rounded-full text-xs font-semibold">Live Control</span>
                    </div>
                    <div className="flex gap-4">
                        <a href="/admin" className="text-slate-600 hover:text-primary font-medium text-sm transition-colors">Dashboard</a>
                        <a href="/" target="_blank" className="text-success hover:text-success/80 text-sm font-medium flex gap-1 items-center transition-colors">
                            <span>↗</span> Open Presentation
                        </a>
                    </div>
                </div>
            </nav>
            <main className="max-w-7xl mx-auto p-4 sm:p-8">
                {children}
            </main>
        </div>
    );
}

import { connection } from 'next/server';
import { Suspense } from 'react';
import { MobileNav } from '@/components/shell/mobile-nav';
import { Sidebar } from '@/components/shell/sidebar';
import { requireOwner } from '@/server/auth';

export default function AppLayout({ children }: LayoutProps<'/'>) {
  // The frame is static; only the page content waits for the session (cacheComponents).
  return (
    <div className="app-frame flex h-dvh overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b px-3 py-2 md:hidden">
          <MobileNav />
          <span className="font-semibold">Personal AI</span>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <Suspense fallback={null}>
            <OwnerGate>{children}</OwnerGate>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

async function OwnerGate({ children }: { children: React.ReactNode }) {
  await connection(); // request-time only: never read the session during `next build`
  await requireOwner();
  return children;
}

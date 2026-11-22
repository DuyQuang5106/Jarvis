import { connection } from 'next/server';
import { Suspense } from 'react';
import { MobileNav } from '@/components/shell/mobile-nav';
import { OnboardingDialog } from '@/components/shell/onboarding-dialog';
import { Sidebar } from '@/components/shell/sidebar';
import { getDb } from '@/db/client';
import { requireOwner } from '@/server/auth';
import { SEED_ITEMS, SEED_TERM_GOAL } from '@/server/seed/seed-data';
import { getSettings } from '@/server/services/settings';

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

// Not enough on its own: a page segment can be prefetched or soft-navigated to without this layout re-running,
// so every page (and every server component reading private data) also calls requireOwner() itself.
async function OwnerGate({ children }: { children: React.ReactNode }) {
  await connection(); // request-time only: never read the session during `next build`
  await requireOwner();
  // Inside the gate (rule 7): settings are private data, never read while the static frame prerenders.
  const { onboardedAt } = await getSettings(await getDb());
  return (
    <>
      {children}
      {onboardedAt === null && <OnboardingDialog items={SEED_ITEMS} termGoal={SEED_TERM_GOAL} />}
    </>
  );
}

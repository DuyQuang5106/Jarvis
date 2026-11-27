import { connection } from 'next/server';
import { Suspense } from 'react';
import { MobileNav } from '@/components/shell/mobile-nav';
import { OnboardingDialog } from '@/components/shell/onboarding-dialog';
import { RecentChats } from '@/components/shell/recent-chats';
import { Sidebar } from '@/components/shell/sidebar';
import { SwipeNav } from '@/components/shell/swipe-nav';
import { Toaster } from '@/components/ui/sonner';
import { getDb } from '@/db/client';
import { requireOwner } from '@/server/auth';
import { SEED_ITEMS, SEED_TERM_GOAL } from '@/server/seed/seed-data';
import { getSettings } from '@/server/services/settings';

export default function AppLayout({ children }: LayoutProps<'/'>) {
  // The frame is static; only the page content and Recent chats wait for the session (cacheComponents).
  const recentChats = (
    <Suspense fallback={null}>
      <RecentChats />
    </Suspense>
  );
  return (
    <div className="app-frame flex h-dvh overflow-hidden">
      <Toaster position="top-center" />
      <SwipeNav />
      <Sidebar recentChats={recentChats} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="app-mobile-header flex items-center gap-2 border-b px-3 py-2 md:hidden">
          <MobileNav recentChats={recentChats} />
          <span className="font-semibold">Personal AI</span>
        </header>
        {/* `relative`: the chat view fills it; the bottom inset is here, not on the frame, so the composer owns it. */}
        <main className="relative min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:p-6 md:pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
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

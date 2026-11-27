'use client';

import { MessageSquare, PanelLeftClose, PanelLeftOpen, SquarePenIcon, Table2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SettingsDialog } from './settings-dialog';
import { ThemeToggle } from './theme-toggle';

const LINKS = [
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/context', label: 'Context', icon: Table2 },
] as const;

const NavigateContext = createContext<(() => void) | undefined>(undefined);

/** Closes the mobile sheet after a link inside the sidebar is followed (undefined on desktop). */
export function useSidebarNavigate(): (() => void) | undefined {
  return useContext(NavigateContext);
}

const DESKTOP = '(min-width: 768px)'; // Tailwind `md`

function subscribeDesktop(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/** Server and first paint assume desktop; on a phone the hidden desktop copy is dropped after hydration. */
function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP).matches, () => true);
}

/** Shared by the desktop sidebar and the mobile sheet. `recentChats` is the server-rendered list. */
export function SidebarBody({ onNavigate, recentChats }: { onNavigate?: () => void; recentChats: ReactNode }) {
  const pathname = usePathname();
  return (
    <NavigateContext.Provider value={onNavigate}>
      <div className="flex h-full flex-col gap-4">
        <nav aria-label="Chính" className="flex flex-col gap-1">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium hover:bg-sidebar-accent',
                  active && 'bg-sidebar-accent text-sidebar-accent-foreground',
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <section aria-label="Recent chats" className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-2">
            <h2 className="px-3 text-xs font-medium uppercase text-muted-foreground">Recent chats</h2>
            <Link
              href="/chat"
              onClick={onNavigate}
              className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
            >
              <SquarePenIcon className="size-4" aria-hidden />
              Chat mới
            </Link>
          </div>
          <div data-testid="recent-chats" className="mt-1 min-h-0 flex-1 overflow-y-auto">
            {recentChats}
          </div>
        </section>
        <div className="flex items-center justify-between gap-2">
          <SettingsDialog />
          <ThemeToggle />
        </div>
      </div>
    </NavigateContext.Provider>
  );
}

export function Sidebar({ recentChats }: { recentChats: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  // One copy of the body at a time: on a phone the sheet (MobileNav) renders it instead.
  const desktop = useIsDesktop();
  return (
    <>
      <aside
        className={cn(
          'app-sidebar hidden w-64 shrink-0 flex-col gap-4 border-r bg-sidebar p-3 text-sidebar-foreground',
          !collapsed && 'md:flex',
        )}
      >
        <div className="flex items-center justify-between">
          <span className="px-3 font-semibold">Personal AI</span>
          <Button variant="ghost" size="icon" className="size-11" onClick={() => setCollapsed(true)} aria-label="Thu gọn thanh bên">
            <PanelLeftClose />
          </Button>
        </div>
        <div className="min-h-0 flex-1">{desktop && <SidebarBody recentChats={recentChats} />}</div>
      </aside>
      {collapsed && (
        <div className="app-sidebar hidden border-r p-2 md:block">
          <Button variant="ghost" size="icon" className="size-11" onClick={() => setCollapsed(false)} aria-label="Mở rộng thanh bên">
            <PanelLeftOpen />
          </Button>
        </div>
      )}
    </>
  );
}

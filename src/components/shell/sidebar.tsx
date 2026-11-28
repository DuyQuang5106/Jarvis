'use client';

import { MessageSquare, PanelLeftClose, PanelLeftOpen, Pin, PinOff, Table2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { setSidebarPinned, useSidebarPinned, useSplitOpen, useWide } from '@/lib/split-view';
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
        <section aria-label="Ô chat" className="flex min-h-0 flex-1 flex-col">
          <h2 className="px-3 pb-1 text-xs font-medium uppercase text-muted-foreground">Ô chat</h2>
          {recentChats}
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
  const pathname = usePathname();
  const split = useSplitOpen();
  const wide = useWide();
  const pinned = useSidebarPinned();
  // "Context + Chat" needs the whole width: there the sidebar hides until the pointer reaches the left edge.
  if (split && wide && pathname === '/chat') {
    return pinned ? (
      <aside className="app-sidebar flex w-64 shrink-0 flex-col gap-4 border-r bg-sidebar p-3 text-sidebar-foreground">
        <SidebarTitle>
          <Button variant="ghost" size="icon" className="size-11" onClick={() => setSidebarPinned(false)} aria-label="Bỏ ghim thanh bên">
            <PinOff />
          </Button>
        </SidebarTitle>
        <div className="min-h-0 flex-1"><SidebarBody recentChats={recentChats} /></div>
      </aside>
    ) : (
      <PeekSidebar recentChats={recentChats} />
    );
  }
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

function SidebarTitle({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="px-3 font-semibold">Personal AI</span>
      {children}
    </div>
  );
}

const PEEK_WIDTH = 256; // w-64

/** Hidden off the left edge; shown while the pointer is near that edge or over it, or while focus is inside. */
function PeekSidebar({ recentChats }: { recentChats: ReactNode }) {
  const [shown, setShown] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const show = () => {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    hideTimer.current = null;
    setShown(true);
  };
  // A short delay, so crossing the panel's border on the way back does not close it.
  const hide = () => {
    if (hideTimer.current === null) hideTimer.current = window.setTimeout(() => {
      hideTimer.current = null;
      setShown(false);
    }, 250);
  };
  // The panel slides in under a resting pointer, so it may never get its own mouseenter/mouseleave: while it is
  // shown, the pointer's position on the page decides. (Over the Context frame the page gets no events; leaving
  // the panel towards it still fires its mouseleave.)
  useEffect(() => {
    if (!shown) return;
    const onMove = (e: MouseEvent) => (e.clientX > PEEK_WIDTH + 24 ? hide() : show());
    document.addEventListener('mousemove', onMove);
    return () => document.removeEventListener('mousemove', onMove);
  });
  return (
    <>
      <div data-testid="sidebar-edge" aria-hidden className="app-sidebar fixed inset-y-0 left-0 z-40 w-4" onMouseEnter={show} />
      <aside
        aria-label="Thanh bên"
        data-shown={shown || undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        className={cn(
          'app-sidebar fixed inset-y-0 left-0 z-50 flex w-64 flex-col gap-4 border-r bg-sidebar p-3 text-sidebar-foreground shadow-xl transition-transform duration-150',
          'pt-[calc(0.75rem+env(safe-area-inset-top))] focus-within:translate-x-0',
          shown ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <SidebarTitle>
          <Button variant="ghost" size="icon" className="size-11" onClick={() => setSidebarPinned(true)} aria-label="Ghim thanh bên">
            <Pin />
          </Button>
        </SidebarTitle>
        <div className="min-h-0 flex-1"><SidebarBody recentChats={recentChats} /></div>
      </aside>
    </>
  );
}

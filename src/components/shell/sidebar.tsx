'use client';

import { MessageSquare, PanelLeftClose, PanelLeftOpen, Settings, Table2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './theme-toggle';

const LINKS = [
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/context', label: 'Context', icon: Table2 },
] as const;

/** Shared by the desktop sidebar and the mobile sheet. */
export function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
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
      <section aria-label="Recent chats" className="min-h-0 flex-1 overflow-y-auto">
        <h2 className="px-3 text-xs font-medium uppercase text-muted-foreground">Recent chats</h2>
        <div data-testid="recent-chats" className="mt-2" />
      </section>
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" className="min-h-11 flex-1 justify-start gap-2">
          <Settings className="size-4" aria-hidden />
          Settings
        </Button>
        <ThemeToggle />
      </div>
    </div>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <>
      <aside
        className={cn(
          'hidden w-64 shrink-0 flex-col gap-4 border-r bg-sidebar p-3 text-sidebar-foreground',
          !collapsed && 'md:flex',
        )}
      >
        <div className="flex items-center justify-between">
          <span className="px-3 font-semibold">Personal AI</span>
          <Button variant="ghost" size="icon" className="size-11" onClick={() => setCollapsed(true)} aria-label="Thu gọn thanh bên">
            <PanelLeftClose />
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <SidebarBody />
        </div>
      </aside>
      {collapsed && (
        <div className="hidden border-r p-2 md:block">
          <Button variant="ghost" size="icon" className="size-11" onClick={() => setCollapsed(false)} aria-label="Mở rộng thanh bên">
            <PanelLeftOpen />
          </Button>
        </div>
      )}
    </>
  );
}

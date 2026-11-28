'use client';

import { BookOpen, MessageSquare, Sun } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { SettingsDialog, TAB_CLASS } from './settings-dialog';

const TABS = [
  { href: '/today', label: 'Hôm nay', icon: Sun, match: (p: string) => p === '/today' },
  { href: '/threads', label: 'Chat', icon: MessageSquare, match: (p: string) => p === '/threads' },
  { href: '/context', label: 'Môn & dự án', icon: BookOpen, match: (p: string) => p.startsWith('/context') },
] as const;

/** Inside a chat the conversation takes the whole screen (back button at its top), as on iOS. */
export const showsTabBar = (pathname: string) => pathname !== '/chat';

/**
 * The phone's navigation (below `md`): Hôm nay · Chat · Môn & dự án · Cài đặt. Part of the page's column, not
 * fixed, so the content above never slides under it; it keeps clear of the home indicator itself.
 */
export function BottomTabs() {
  const pathname = usePathname();
  const shown = showsTabBar(pathname);
  useEffect(() => {
    // The bar carries the home-indicator inset; <main> then does not add it again.
    document.documentElement.toggleAttribute('data-tabbar', shown);
  }, [shown]);
  if (!shown) return null;
  return (
    <nav aria-label="Tab" className="app-tabbar flex shrink-0 border-t bg-sidebar pb-[env(safe-area-inset-bottom)] md:hidden">
      {TABS.map(({ href, label, icon: Icon, match }) => (
        <Link key={href} href={href} aria-current={match(pathname) ? 'page' : undefined} className={TAB_CLASS}>
          <Icon className="size-5" aria-hidden />
          {label}
        </Link>
      ))}
      <SettingsDialog trigger="tab" />
    </nav>
  );
}

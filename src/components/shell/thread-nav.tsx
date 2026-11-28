'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { THREAD_TOUCHED, threadTouches, type ThreadTouch } from '@/components/chat/thread-events';
import { cn } from '@/lib/utils';
import type { ThreadListItem } from '@/server/services/conversations';
import { useSidebarNavigate } from './sidebar';

/** Where a thread opens: by its conversation once it has one, else by what it is ("Chung" or the subject). */
export function threadHref(t: Pick<ThreadListItem, 'areaId'>): string {
  return t.areaId ? `/chat?area=${t.areaId}` : '/chat';
}

const shortTime = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })
    : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
};

/**
 * "Ô chat": "Chung", then one thread per open subject or project, the most recently used first. Below, "Lưu trữ"
 * (collapsed) holds the conversations from before threads, with their rename/delete menu.
 */
export function ThreadNav({ threads: initial, archive, archivedCount }: { threads: ThreadListItem[]; archive: ReactNode; archivedCount: number }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const onNavigate = useSidebarNavigate();
  const [threads, setThreads] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setThreads(initial);
  }
  const [archiveOpen, setArchiveOpen] = useState(false);

  useEffect(() => {
    const apply = (t: ThreadTouch) =>
      setThreads((list) => {
        const hit = list.find((x) => x.key === t.key);
        if (!hit) return list;
        const updated = { ...hit, conversationId: t.conversationId, lastMessage: t.lastMessage, updatedAt: t.at };
        const [general, ...rest] = list.map((x) => (x.key === t.key ? updated : x));
        // "Chung" stays first; a subject that just got a message moves to the top of the subjects.
        return t.key === 'general' ? [general, ...rest] : [general, updated, ...rest.filter((x) => x.key !== t.key)];
      });
    // Touches from before this list mounted (the phone menu opens later), newer than what the server sent.
    for (const t of threadTouches()) {
      const hit = initial.find((x) => x.key === t.key);
      if (hit && (!hit.updatedAt || t.at > hit.updatedAt)) apply(t);
    }
    const onTouch = (e: Event) => apply((e as CustomEvent<ThreadTouch>).detail);
    window.addEventListener(THREAD_TOUCHED, onTouch);
    return () => window.removeEventListener(THREAD_TOUCHED, onTouch);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- past touches are applied once, on mount
  }, []);

  const openArea = pathname === '/chat' ? params.get('area') : null;
  const openC = pathname === '/chat' ? params.get('c') : null;
  const isActive = (t: ThreadListItem) =>
    pathname === '/chat' && (t.areaId ? openArea === t.areaId : !openArea && (!openC || openC === t.conversationId));

  return (
    // One scroll area for the threads and the archive: an opened archive row (rename field, delete confirm) is
    // always reachable, however short the window.
    <div className="min-h-0 flex-1 overflow-y-auto">
      <nav data-testid="threads" aria-label="Ô chat" className="flex flex-col gap-0.5">
        {threads.map((t) => {
          const active = isActive(t);
          return (
            <Link
                key={t.key}
                href={threadHref(t)}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 flex-col justify-center rounded-lg px-3 py-1.5 text-sm outline-none hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-ring/50',
                  active && 'bg-sidebar-accent text-sidebar-accent-foreground',
                )}
              >
                <span className="flex items-baseline gap-2">
                  <span className={cn('min-w-0 flex-1 truncate', active && 'font-medium')}>{t.name}</span>
                  {t.updatedAt && <span className="shrink-0 text-xs text-muted-foreground">{shortTime(t.updatedAt)}</span>}
                </span>
                {t.lastMessage && <span className="truncate text-xs text-muted-foreground">{t.lastMessage}</span>}
              </Link>
          );
        })}
      </nav>
      {archivedCount > 0 && (
        <div className="mt-1 border-t pt-1">
          <button
            type="button"
            onClick={() => setArchiveOpen((v) => !v)}
            aria-expanded={archiveOpen}
            className="flex min-h-11 w-full items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground hover:bg-sidebar-accent"
          >
            <ChevronRight aria-hidden className={cn('size-4 transition-transform', archiveOpen && 'rotate-90')} />
            Lưu trữ · {archivedCount} cuộc chat
          </button>
          {archiveOpen && archive}
        </div>
      )}
    </div>
  );
}

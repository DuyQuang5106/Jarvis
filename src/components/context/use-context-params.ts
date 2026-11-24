'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import type { AreaKind } from '@/db/enums';

export type TabId = 'academic' | 'projects';
export const TAB_KIND: Record<TabId, AreaKind> = { academic: 'academic', projects: 'project' };
export const KIND_TAB: Record<AreaKind, TabId> = { academic: 'academic', project: 'projects' };

/** `?tab=`, `?item=`, `?doc=`, and `?section=` live in the URL; every change keeps the other params. */
export function useContextParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get('tab');
  const tab: TabId = raw === 'projects' ? 'projects' : 'academic';
  const item = params.get('item');
  const doc = params.get('doc');
  const section = params.get('section') ?? 'overview';

  const update = useCallback(
    (changes: Record<string, string | null>, mode: 'push' | 'replace') => {
      const q = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v === null) q.delete(k);
        else q.set(k, v);
      }
      router[mode](`${pathname}?${q.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  return {
    tab,
    item,
    doc,
    setTab: (next: TabId) => update({ tab: next }, 'replace'),
    section,
    setSection: (next: string) => update({ section: next }, 'replace'),
    setDoc: (next: string | null) => update({ doc: next }, 'replace'),
    closeItem: () => update({ item: null, section: null, doc: null }, 'replace'),
    openItem: (id: string, nextTab?: TabId, nextDoc?: string | null) =>
      update(
        {
          item: id,
          ...(nextTab ? { tab: nextTab } : {}),
          ...(nextDoc !== undefined ? { doc: nextDoc } : { doc: null }),
        },
        'push',
      ),
  };
}

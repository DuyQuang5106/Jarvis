'use client';

import { useMemo, useState } from 'react';
import type { AreaRow } from '@/db/schema';
import type { AreaSummary } from '@/server/queries/snapshot';
import { AreaList } from './area-list';
import { ContextHeader } from './context-header';
import { matchesQuery } from './search';
import { StaleStrip } from './stale-strip';
import { KIND_TAB, TAB_KIND, useContextParams } from './use-context-params';

export function ContextView({
  areas,
  archived,
}: {
  areas: AreaSummary[];
  archived: Record<'academic' | 'project', AreaRow[]>;
}) {
  const { tab, setTab, openItem } = useContextParams();
  const [query, setQuery] = useState('');
  const kind = TAB_KIND[tab];

  const visible = useMemo(
    () => areas.filter((a) => a.kind === kind && matchesQuery(a, query)),
    [areas, kind, query],
  );
  const stale = useMemo(() => areas.filter((a) => a.isStale), [areas]);

  return (
    <div className="space-y-4">
      <ContextHeader tab={tab} onTab={setTab} query={query} onQuery={setQuery} />
      <StaleStrip areas={stale} onOpen={(a) => openItem(a.id, KIND_TAB[a.kind])} />
      <AreaList
        areas={visible}
        archived={archived[kind]}
        kindLabel={kind === 'academic' ? 'môn học' : 'dự án'}
        searching={query.trim() !== ''}
        onOpen={(a) => openItem(a.id)}
      />
    </div>
  );
}

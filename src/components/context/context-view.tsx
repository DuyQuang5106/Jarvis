'use client';

import { useMemo, useState } from 'react';
import type { AreaRow } from '@/db/schema';
import type { AreaSummary } from '@/server/queries/snapshot';
import type { AreaDetails } from '@/server/queries/area-details';
import { AreaDrawer, MissingAreaDrawer } from './area-drawer';
import { AreaList } from './area-list';
import { ContextHeader } from './context-header';
import { matchesQuery } from './search';
import { StaleStrip } from './stale-strip';
import { KIND_TAB, TAB_KIND, useContextParams } from './use-context-params';

export function ContextView({
  areas,
  today,
  archived,
  loadedItem,
  details,
}: {
  areas: AreaSummary[];
  today: string;
  archived: Record<'academic' | 'project', AreaRow[]>;
  /** The `?item=` the server loaded `details` for; null details with a loadedItem means not found. */
  loadedItem: string | null;
  details: AreaDetails | null;
}) {
  const { tab, setTab, openItem, item, section } = useContextParams();
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
      {item !== null && item === loadedItem && (details ? <AreaDrawer key={details.area.id} details={details} section={section} summary={areas.find((a) => a.id === details.area.id) ?? null} today={today} /> : <MissingAreaDrawer />)}
    </div>
  );
}

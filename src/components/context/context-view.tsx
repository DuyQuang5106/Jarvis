'use client';

import { useMemo, useState } from 'react';
import type { AreaRow } from '@/db/schema';
import type { AreaSummary } from '@/server/queries/snapshot';
import type { AreaDetails, InboxNote } from '@/server/queries/area-details';
import { AreaList } from './area-list';
import { ContextHeader } from './context-header';
import { DocSearchDialog } from './doc-search-dialog';
import { InboxList } from './inbox-list';
import { matchesQuery } from './search';
import { StaleStrip } from './stale-strip';
import { KIND_TAB, TAB_KIND, useContextParams } from './use-context-params';
import { MissingAreaWorkspace, WorkspaceView } from './workspace-view';

export function ContextView({
  areas,
  today,
  archived,
  loadedItem,
  details,
  inbox,
  actionMode = 'off',
}: {
  areas: AreaSummary[];
  today: string;
  archived: Record<'academic' | 'project', AreaRow[]>;
  /** The `?item=` the server loaded `details` for; null details with a loadedItem means not found. */
  loadedItem: string | null;
  details: AreaDetails | null;
  inbox: InboxNote[];
  actionMode?: 'tools' | 'json' | 'off';
}) {
  const { tab, setTab, openItem, item, section } = useContextParams();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const kind = TAB_KIND[tab];

  const visible = useMemo(
    () => areas.filter((a) => a.kind === kind && matchesQuery(a, query)),
    [areas, kind, query],
  );
  const stale = useMemo(() => areas.filter((a) => a.isStale), [areas]);

  return (
    <div className="space-y-4">
      <ContextHeader tab={tab} onTab={setTab} query={query} onQuery={setQuery} onSearchDocs={() => setSearchOpen(true)} />
      <InboxList notes={inbox} areas={areas} actionMode={actionMode} />
      <StaleStrip areas={stale} onOpen={(a) => openItem(a.id, KIND_TAB[a.kind])} />
      <AreaList
        areas={visible}
        archived={archived[kind]}
        kindLabel={kind === 'academic' ? 'môn học' : 'dự án'}
        searching={query.trim() !== ''}
        onOpen={(a) => openItem(a.id)}
      />
      <DocSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onPick={(hit) => openItem(hit.areaId, KIND_TAB[hit.areaKind], hit.id, hit.folderId)}
      />
      {item !== null && item === loadedItem && (details ? <WorkspaceView key={details.area.id} details={details} section={section} summary={areas.find((a) => a.id === details.area.id) ?? null} today={today} /> : <MissingAreaWorkspace />)}
    </div>
  );
}

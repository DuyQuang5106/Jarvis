'use client';

import { useEffect, useMemo, useState } from 'react';
import { CONTEXT_ITEM_MESSAGE } from '@/lib/split-view';
import { attentionAreas, focusItem } from '@/lib/overview';
import type { AreaRow } from '@/db/schema';
import type { AreaSummary } from '@/server/queries/snapshot';
import type { AreaDetails, InboxNote } from '@/server/queries/area-details';
import type { AreaGlance, MetricsReport } from '@/server/queries/area-metrics';
import { AreaList } from './area-list';
import { ContextOverview, type UpcomingItem } from './context-overview';
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
  metrics = { byArea: {}, week: { levelUps: 0, tasksDone: 0, milestonesDone: 0, datesChanged: 0 } },
  glance = {},
  upcoming = [],
}: {
  metrics?: MetricsReport;
  glance?: Record<string, AreaGlance>;
  /** Exams and open tasks within 7 days, overdue ones included. */
  upcoming?: UpcomingItem[];
  areas: AreaSummary[];
  today: string;
  archived: Record<'academic' | 'project', AreaRow[]>;
  /** The `?item=` the server loaded `details` for; null details with a loadedItem means not found. */
  loadedItem: string | null;
  details: AreaDetails | null;
  inbox: InboxNote[];
  actionMode?: 'tools' | 'json' | 'off';
}) {
  const { tab, setTab, openItem, item, section, pending } = useContextParams();
  // Inside "Context + Chat": tell the chat half which subject is open, so it shows that subject's thread.
  useEffect(() => {
    if (!item || window.self === window.top) return;
    window.parent.postMessage({ type: CONTEXT_ITEM_MESSAGE, areaId: item }, window.location.origin);
  }, [item]);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const kind = TAB_KIND[tab];

  const visible = useMemo(
    () => areas.filter((a) => a.kind === kind && matchesQuery(a, query)),
    [areas, kind, query],
  );
  const stale = useMemo(() => areas.filter((a) => a.isStale), [areas]);
  // Off track first, then at risk; within each, the nearest date.
  const attention = useMemo(() => attentionAreas(areas, metrics.byArea), [areas, metrics]);
  const focus = useMemo(() => focusItem(attention, metrics.byArea, glance), [attention, metrics, glance]);

  return (
    <div className="space-y-4">
      {pending && (
        <div role="status" className="fixed inset-x-0 top-[calc(0.5rem+env(safe-area-inset-top))] z-50 mx-auto w-fit rounded-full border bg-card px-3 py-1 text-sm shadow">
          Đang mở…
        </div>
      )}
      <ContextHeader tab={tab} onTab={setTab} query={query} onQuery={setQuery} onSearchDocs={() => setSearchOpen(true)} />
      <ContextOverview
        attention={attention.map((a) => ({ id: a.id, name: a.name }))}
        upcoming={upcoming}
        week={metrics.week}
        focus={focus}
        onOpen={(id) => {
          const a = areas.find((x) => x.id === id);
          if (a) openItem(a.id, KIND_TAB[a.kind]);
        }}
      />
      <InboxList notes={inbox} areas={areas} actionMode={actionMode} />
      <StaleStrip areas={stale} onOpen={(a) => openItem(a.id, KIND_TAB[a.kind])} />
      <AreaList
        areas={visible}
        archived={archived[kind]}
        kindLabel={kind === 'academic' ? 'môn học' : 'dự án'}
        searching={query.trim() !== ''}
        onOpen={(a) => openItem(a.id)}
        metrics={metrics.byArea}
        glance={glance}
      />
      <DocSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onPick={(hit) => openItem(hit.areaId, KIND_TAB[hit.areaKind], hit.id, hit.folderId)}
      />
      {item !== null && item === loadedItem && (details ? <WorkspaceView key={details.area.id} details={details} section={section} summary={areas.find((a) => a.id === details.area.id) ?? null} today={today} actionMode={actionMode} /> : <MissingAreaWorkspace />)}
    </div>
  );
}

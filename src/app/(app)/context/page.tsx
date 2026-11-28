import { connection } from 'next/server';
import { Suspense } from 'react';
import { ContextView } from '@/components/context/context-view';
import { getDb } from '@/db/client';
import { requireOwner } from '@/server/auth';
import { getConfig } from '@/server/config';
import { getAreaDetails, listArchivedAreas, listInboxNotes } from '@/server/queries/area-details';
import { getAreaGlance, getAreaMetrics } from '@/server/queries/area-metrics';
import { getPortfolioSnapshot } from '@/server/queries/snapshot';

export const metadata = { title: 'Context' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ContextPage({ searchParams }: { searchParams: Promise<{ item?: string | string[] }> }) {
  // The page checks the owner itself: its segment can be fetched without running the layout's gate.
  return (
    <Suspense fallback={null}>
      <ContextContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ContextContent({ searchParams }: { searchParams: Promise<{ item?: string | string[] }> }) {
  await connection(); // request-time only: never read the session or the DB during `next build`
  await requireOwner();
  const { item } = await searchParams;
  const itemId = typeof item === 'string' ? item : null;
  const db = await getDb();
  const now = new Date();
  const [snapshot, academic, project, details, inbox, metrics, glance] = await Promise.all([
    getPortfolioSnapshot(db, now),
    listArchivedAreas(db, 'academic'),
    listArchivedAreas(db, 'project'),
    itemId && UUID.test(itemId) ? getAreaDetails(db, itemId) : null,
    listInboxNotes(db),
    getAreaMetrics(db, now),
    getAreaGlance(db, now),
  ]);
  const areaName = new Map(snapshot.areas.map((a) => [a.id, a.name]));
  const upcoming = [
    ...snapshot.upcomingAssessments.filter((a) => a.daysLeft <= 7).map((a) => ({ key: `a-${a.id}`, title: a.title, areaId: a.areaId, daysLeft: a.daysLeft })),
    ...snapshot.dueTasks.filter((t) => t.daysLeft <= 7 && t.status !== 'done').map((t) => ({ key: `t-${t.id}`, title: t.title, areaId: t.areaId, daysLeft: t.daysLeft })),
  ]
    .filter((u) => areaName.has(u.areaId))
    .map(({ areaId, ...u }) => ({ ...u, areaName: areaName.get(areaId)! }))
    .sort((a, b) => a.daysLeft - b.daysLeft);
  return (
    <ContextView
      areas={snapshot.areas}
      today={snapshot.today}
      archived={{ academic, project }}
      loadedItem={itemId}
      details={details}
      inbox={inbox}
      actionMode={getConfig().aiActionMode}
      metrics={metrics}
      glance={glance}
      upcoming={upcoming}
    />
  );
}

import { connection } from 'next/server';
import { Suspense } from 'react';
import { ContextView } from '@/components/context/context-view';
import { getDb } from '@/db/client';
import { requireOwner } from '@/server/auth';
import { getAreaDetails, listArchivedAreas } from '@/server/queries/area-details';
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
  const [snapshot, academic, project, details] = await Promise.all([
    getPortfolioSnapshot(db, new Date()),
    listArchivedAreas(db, 'academic'),
    listArchivedAreas(db, 'project'),
    itemId && UUID.test(itemId) ? getAreaDetails(db, itemId) : null,
  ]);
  return <ContextView areas={snapshot.areas} archived={{ academic, project }} loadedItem={itemId} details={details} />;
}

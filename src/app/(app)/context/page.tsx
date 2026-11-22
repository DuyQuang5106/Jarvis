import { connection } from 'next/server';
import { Suspense } from 'react';
import { ContextView } from '@/components/context/context-view';
import { getDb } from '@/db/client';
import { requireOwner } from '@/server/auth';
import { listArchivedAreas } from '@/server/queries/area-details';
import { getPortfolioSnapshot } from '@/server/queries/snapshot';

export const metadata = { title: 'Context' };

export default function ContextPage() {
  // The page checks the owner itself: its segment can be fetched without running the layout's gate.
  return (
    <Suspense fallback={null}>
      <ContextContent />
    </Suspense>
  );
}

async function ContextContent() {
  await connection(); // request-time only: never read the session or the DB during `next build`
  await requireOwner();
  const db = await getDb();
  const [snapshot, academic, project] = await Promise.all([
    getPortfolioSnapshot(db, new Date()),
    listArchivedAreas(db, 'academic'),
    listArchivedAreas(db, 'project'),
  ]);
  return <ContextView areas={snapshot.areas} archived={{ academic, project }} />;
}

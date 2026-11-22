import { connection } from 'next/server';
import { Suspense } from 'react';
import { requireOwner } from '@/server/auth';
import { ContextTabs } from './context-tabs';

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
  await connection(); // request-time only: never read the session during `next build`
  await requireOwner();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Context</h1>
      <Suspense fallback={null}>
        <ContextTabs />
      </Suspense>
    </div>
  );
}

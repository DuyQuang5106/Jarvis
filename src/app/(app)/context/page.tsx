import { Suspense } from 'react';
import { ContextTabs } from './context-tabs';

export const metadata = { title: 'Context' };

export default function ContextPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Context</h1>
      <Suspense fallback={null}>
        <ContextTabs />
      </Suspense>
    </div>
  );
}

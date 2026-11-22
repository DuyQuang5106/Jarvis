import { connection } from 'next/server';
import { Suspense } from 'react';
import { requireOwner } from '@/server/auth';

export const metadata = { title: 'Chat' };

export default function ChatPage() {
  // The page checks the owner itself: its segment can be fetched without running the layout's gate.
  return (
    <Suspense fallback={null}>
      <ChatContent />
    </Suspense>
  );
}

async function ChatContent() {
  await connection(); // request-time only: never read the session during `next build`
  await requireOwner();
  return <h1 className="text-xl font-semibold">Chat</h1>;
}

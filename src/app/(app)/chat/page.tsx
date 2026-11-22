import { connection } from 'next/server';
import { Suspense } from 'react';
import { ChatView, type ChatMessageView } from '@/components/chat/chat-view';
import { getDb } from '@/db/client';
import type { MessageRow } from '@/db/schema';
import type { ContextRef } from '@/server/ai/context-builder';
import { requireOwner } from '@/server/auth';
import { getPortfolioSnapshot } from '@/server/queries/snapshot';
import { getConversation } from '@/server/services/conversations';

export const metadata = { title: 'Chat' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchParams = Promise<{ c?: string | string[] }>;

export default function ChatPage({ searchParams }: { searchParams: SearchParams }) {
  // The page checks the owner itself: its segment can be fetched without running the layout's gate.
  return (
    <Suspense fallback={null}>
      <ChatContent searchParams={searchParams} />
    </Suspense>
  );
}

function toView(m: MessageRow): ChatMessageView | null {
  if (m.role !== 'user' && m.role !== 'assistant') return null;
  const meta = (m.metadata ?? {}) as { contextRefs?: ContextRef[]; summaryCount?: number };
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    contextRefs: Array.isArray(meta.contextRefs) ? meta.contextRefs : [],
    summaryCount: typeof meta.summaryCount === 'number' ? meta.summaryCount : 0,
  };
}

async function ChatContent({ searchParams }: { searchParams: SearchParams }) {
  await connection(); // request-time only: never read the session or the DB during `next build`
  await requireOwner();
  const { c } = await searchParams;
  const id = typeof c === 'string' && UUID.test(c) ? c : null;
  const db = await getDb();
  const [found, snapshot] = await Promise.all([id ? getConversation(db, id) : null, getPortfolioSnapshot(db, new Date())]);
  return (
    <ChatView
      conversation={found ? { id: found.conversation.id, title: found.conversation.title } : null}
      messages={(found?.messages ?? []).map(toView).filter((m) => m !== null)}
      areas={snapshot.areas.map((a) => ({ id: a.id, name: a.name, kind: a.kind, aiExcluded: a.aiExcluded }))}
    />
  );
}

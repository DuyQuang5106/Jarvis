import { connection } from 'next/server';
import { getDb } from '@/db/client';
import { requireOwner } from '@/server/auth';
import { listConversations } from '@/server/services/conversations';
import { RecentChatList } from './recent-chat-list';

const LIMIT = 30;

/** Sidebar list of conversations. Reads private data, so it checks the owner itself (rule 7); render inside Suspense. */
export async function RecentChats() {
  await connection(); // request-time only: never read the session or the DB during `next build`
  await requireOwner();
  const rows = await listConversations(await getDb(), LIMIT);
  return <RecentChatList items={rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt.toISOString() }))} limit={LIMIT} />;
}

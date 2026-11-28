import { connection } from 'next/server';
import { getDb } from '@/db/client';
import { requireOwner } from '@/server/auth';
import { listArchivedConversations, listThreads } from '@/server/services/conversations';
import { RecentChatList } from './recent-chat-list';
import { ThreadNav } from './thread-nav';

const LIMIT = 100;

/** Sidebar: the threads, and the archive of older conversations. Reads private data, so it checks the owner. */
export async function RecentChats() {
  await connection(); // request-time only: never read the session or the DB during `next build`
  await requireOwner();
  const db = await getDb();
  const [threads, archived] = await Promise.all([listThreads(db), listArchivedConversations(db, LIMIT)]);
  return (
    <ThreadNav
      threads={threads}
      archivedCount={archived.length}
      archive={
        <div data-testid="recent-chats">
          <RecentChatList items={archived.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt.toISOString() }))} limit={LIMIT} />
        </div>
      }
    />
  );
}

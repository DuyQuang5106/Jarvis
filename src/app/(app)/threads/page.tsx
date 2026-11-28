import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { RecentChatList } from '@/components/shell/recent-chat-list';
import { getDb } from '@/db/client';
import type { HealthLevel } from '@/lib/state-metrics';
import { cn } from '@/lib/utils';
import { requireOwner } from '@/server/auth';
import { getAreaMetrics } from '@/server/queries/area-metrics';
import { listArchivedConversations, listThreads } from '@/server/services/conversations';

export const metadata = { title: 'Chat' };

export default function ThreadsPage() {
  return (
    <Suspense fallback={null}>
      <Threads />
    </Suspense>
  );
}

/** The dot next to a subject: its health (blue for "Chung"); a colour never stands alone, the list says why. */
const DOT: Record<HealthLevel | 'general', string> = {
  general: 'bg-sky-400',
  on_track: 'bg-emerald-400',
  at_risk: 'bg-amber-400',
  off_track: 'bg-red-400',
  unknown: 'bg-foreground/30',
};
const DOT_LABEL: Record<HealthLevel, string> = { on_track: 'Đúng hướng', at_risk: 'Có rủi ro', off_track: 'Lệch hướng', unknown: 'Chưa đủ dữ liệu' };

const when = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const sameDay = d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) === new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  return sameDay
    ? d.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false })
    : d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' });
};

/** The phone's Chat tab: every thread, one tap from the conversation; old chats under "Lưu trữ". */
async function Threads() {
  await connection();
  await requireOwner();
  const db = await getDb();
  const [threads, archived, metrics] = await Promise.all([listThreads(db), listArchivedConversations(db, 100), getAreaMetrics(db, new Date())]);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Chat</h1>
        <p className="text-sm text-muted-foreground">Mỗi môn một ô; Jarvis đọc đúng tài liệu của môn đó.</p>
      </header>
      <nav aria-label="Ô chat" data-testid="thread-list" className="divide-y rounded-xl border bg-card">
        {threads.map((t) => {
          const level = t.areaId ? (metrics.byArea[t.areaId]?.health?.level ?? 'unknown') : null;
          return (
            <Link key={t.key} href={t.areaId ? `/chat?area=${t.areaId}` : '/chat'} className="flex min-h-14 items-center gap-3 px-4 py-3">
              <span
                className={cn('size-2.5 shrink-0 rounded-full', DOT[level ?? 'general'])}
                role="img"
                aria-label={level ? DOT_LABEL[level] : 'Ô chung'}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{when(t.updatedAt)}</span>
                </span>
                <span className="block truncate text-sm text-muted-foreground">{t.lastMessage ?? 'Chưa có tin nhắn'}</span>
              </span>
            </Link>
          );
        })}
      </nav>
      {archived.length > 0 && (
        <section aria-label="Lưu trữ" className="space-y-2">
          <h2 className="px-1 text-sm font-medium text-muted-foreground">Lưu trữ · {archived.length} cuộc chat</h2>
          <div data-testid="recent-chats" className="rounded-xl border bg-card p-1">
            <RecentChatList items={archived.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt.toISOString() }))} limit={100} />
          </div>
        </section>
      )}
    </div>
  );
}

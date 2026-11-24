import { and, eq } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import { pendingActions } from '@/db/schema';
import type { ProposeChanges, StoredProposal } from './schema';
import { hasDeadline, hasDeadlineRoute } from './routing';
import { stampActions } from './validate';

export const IGNORED_PROPOSAL_NOTICE =
  '\n\n_(AI có đề xuất cập nhật nhưng đề xuất không hợp lệ nên đã bị bỏ qua. Chưa có gì được thay đổi; bạn có thể cập nhật trong Context.)_';

export async function createPendingAction(
  db: DbOrTx,
  input: {
    source: 'chat' | 'capture';
    conversationId?: string;
    messageId?: string;
    noteId?: string;
    proposal: ProposeChanges;
    requestText?: string;
  },
): Promise<{ id: string } | null> {
  const requiresDeadlineRoute = hasDeadline(input.requestText ?? '');
  if (requiresDeadlineRoute && !hasDeadlineRoute(input.proposal.actions)) return null;
  const stamped = await stampActions(db, input.proposal.actions);
  if (!stamped.ok) return null;
  const payload: StoredProposal = { summary: input.proposal.summary, actions: stamped.stored, ...(requiresDeadlineRoute ? { requiresDeadlineRoute } : {}) };
  const [row] = await db
    .insert(pendingActions)
    .values({
      source: input.source,
      conversationId: input.conversationId ?? null,
      messageId: input.messageId ?? null,
      noteId: input.noteId ?? null,
      actionsJson: payload,
      status: 'pending',
    })
    .returning({ id: pendingActions.id });
  return row;
}

export async function supersedeForMessage(db: DbOrTx, messageId: string): Promise<void> {
  await db
    .update(pendingActions)
    .set({ status: 'superseded', resolvedAt: new Date() })
    .where(and(eq(pendingActions.messageId, messageId), eq(pendingActions.status, 'pending')));
}

export async function supersedeForNote(db: DbOrTx, noteId: string): Promise<void> {
  await db
    .update(pendingActions)
    .set({ status: 'superseded', resolvedAt: new Date() })
    .where(and(eq(pendingActions.noteId, noteId), eq(pendingActions.status, 'pending')));
}

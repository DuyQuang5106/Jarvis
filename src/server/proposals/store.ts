import { and, eq } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import { pendingActions } from '@/db/schema';
import type { ProposeChanges, StoredProposal } from './schema';
import { hasDeadline, hasDeadlineRoute } from './routing';
import { stampEachAction } from './validate';

export type DroppedProposalReason = 'parse' | 'schema' | 'deadline_route' | 'invalid_target';

export type CreatePendingResult =
  /** `skipped`: actions left out because their target does not exist (the rest were stored). */
  | { ok: true; id: string; skipped: number }
  /** `detail` names what failed (action indices), never values the user or the model wrote. */
  | { ok: false; reason: 'deadline_route' | 'invalid_target'; detail: string };

const DROPPED_BECAUSE: Record<DroppedProposalReason, string> = {
  parse: 'đề xuất không đúng định dạng nên đã bị bỏ qua. Bạn thử nói lại ngắn gọn hơn, hoặc cập nhật trong Context.',
  schema: 'đề xuất không đúng định dạng nên đã bị bỏ qua. Bạn thử nói lại ngắn gọn hơn, hoặc cập nhật trong Context.',
  deadline_route:
    'đề xuất chỉ ghi hạn vào tài liệu mà không tạo task hay lịch thi có ngày, nên đã bị bỏ qua. Bạn thử nhắn lại kèm ngày cụ thể.',
  invalid_target: 'đề xuất trỏ tới một mục không còn tồn tại nên đã bị bỏ qua. Bạn thử nêu rõ tên môn hoặc dự án.',
};

/** Appended to a chat reply whose proposal lost some actions but kept the rest. */
export function skippedActionsNotice(count: number): string {
  return `

_(Đã bỏ ${count} thay đổi không hợp lệ trong đề xuất; phần còn lại đang chờ bạn duyệt.)_`;
}

/** Appended to a chat reply whose proposal was dropped, saying why. */
export function ignoredProposalNotice(reason: DroppedProposalReason): string {
  return `\n\n_(AI có đề xuất cập nhật nhưng ${DROPPED_BECAUSE[reason]} Chưa có gì được thay đổi.)_`;
}

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
): Promise<CreatePendingResult> {
  const requiresDeadlineRoute = hasDeadline(input.requestText ?? '');
  if (requiresDeadlineRoute && !hasDeadlineRoute(input.proposal.actions)) {
    return { ok: false, reason: 'deadline_route', detail: 'no dated task or assessment' };
  }
  const stamped = await stampEachAction(db, input.proposal.actions);
  // Actions with a missing target are left out; the proposal is dropped only when none remains.
  if (stamped.stored.length === 0) {
    return { ok: false, reason: 'invalid_target', detail: stamped.errors.map((e) => `actions[${e.index}]`).join(',') };
  }
  if (requiresDeadlineRoute && !hasDeadlineRoute(stamped.stored.map((s) => s.action))) {
    return { ok: false, reason: 'deadline_route', detail: 'no dated task or assessment' };
  }
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
  return { ok: true, id: row.id, skipped: stamped.errors.length };
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

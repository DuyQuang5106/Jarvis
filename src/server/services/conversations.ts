import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import { areas, conversations, messages, type ConversationRow, type MessageRow } from '@/db/schema';
import type { ConversationKind } from '@/db/enums';
import { NotFoundError, ValidationError } from '../errors';

export async function listConversations(db: DbOrTx, limit = 30): Promise<ConversationRow[]> {
  return db.select().from(conversations).orderBy(desc(conversations.updatedAt)).limit(limit);
}

export async function getConversation(
  db: DbOrTx,
  id: string,
): Promise<{ conversation: ConversationRow; messages: MessageRow[] } | null> {
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conversation) return null;
  const rows = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt, messages.id);
  return { conversation, messages: rows };
}

/** Renaming is not activity: `updated_at` (the Recent chats order) stays. */
export async function renameConversation(db: DbOrTx, id: string, title: string): Promise<void> {
  const t = title.trim();
  if (t.length < 1 || t.length > 200) throw new ValidationError('Tiêu đề phải dài 1–200 ký tự.');
  const rows = await db
    .update(conversations)
    .set({ title: t })
    .where(eq(conversations.id, id))
    .returning({ id: conversations.id });
  if (rows.length === 0) throw new NotFoundError('Không tìm thấy cuộc trò chuyện.');
}

export async function deleteConversation(db: DbOrTx, id: string): Promise<void> {
  const rows = await db.delete(conversations).where(eq(conversations.id, id)).returning({ id: conversations.id });
  if (rows.length === 0) throw new NotFoundError('Không tìm thấy cuộc trò chuyện.');
}

export async function createConversation(
  db: DbOrTx,
  title: string,
  kind: ConversationKind = 'legacy',
): Promise<ConversationRow> {
  const [row] = await db.insert(conversations).values({ title, kind }).returning();
  return row;
}

/** Which thread a message goes to when no conversation is open yet: "Chung", or a subject's thread. */
export type ThreadTarget = { general: true } | { areaId: string };

/** The thread for `target`, created on first use (one "Chung", one per subject: the unique indexes hold it). */
export async function getOrCreateThread(db: DbOrTx, target: ThreadTarget): Promise<ConversationRow> {
  if ('general' in target) {
    await db.insert(conversations).values({ title: 'Chung', kind: 'general' }).onConflictDoNothing();
    const [row] = await db.select().from(conversations).where(eq(conversations.kind, 'general'));
    return row;
  }
  const [area] = await db.select({ name: areas.name }).from(areas).where(eq(areas.id, target.areaId));
  if (!area) throw new NotFoundError('Không tìm thấy mục.');
  await db.insert(conversations).values({ title: area.name, kind: 'area', areaId: target.areaId }).onConflictDoNothing();
  const [row] = await db.select().from(conversations).where(and(eq(conversations.kind, 'area'), eq(conversations.areaId, target.areaId)));
  return row;
}

/** A subject's thread, or null before its first message. */
export async function findAreaThread(db: DbOrTx, areaId: string): Promise<ConversationRow | null> {
  const [row] = await db.select().from(conversations).where(and(eq(conversations.kind, 'area'), eq(conversations.areaId, areaId)));
  return row ?? null;
}

/** The "Chung" thread, or null before its first message. */
export async function findGeneralThread(db: DbOrTx): Promise<ConversationRow | null> {
  const [row] = await db.select().from(conversations).where(eq(conversations.kind, 'general'));
  return row ?? null;
}

export type ThreadListItem = {
  /** `general` or the area's id. */
  key: string;
  areaId: string | null;
  name: string;
  conversationId: string | null;
  lastMessage: string | null;
  updatedAt: string | null;
};

/**
 * The sidebar's "Ô chat": "Chung" first, then every open subject and project that AI may read, the most recently
 * used first (those never used, by name). A subject without messages yet is listed too: its thread starts on the
 * first message.
 */
export async function listThreads(db: DbOrTx): Promise<ThreadListItem[]> {
  const [areaRows, threads] = await Promise.all([
    db
      .select({ id: areas.id, name: areas.name })
      .from(areas)
      .where(and(isNull(areas.archivedAt), eq(areas.aiExcluded, false), ne(areas.status, 'completed'))),
    db
      .select({
        id: conversations.id, kind: conversations.kind, areaId: conversations.areaId, updatedAt: conversations.updatedAt,
        // Qualified by hand: inside the subquery a bare `id` would be the message's.
        last: sql<string | null>`(select m.content from messages m where m.conversation_id = "conversations"."id" order by m.created_at desc, m.id desc limit 1)`,
      })
      .from(conversations)
      .where(inArray(conversations.kind, ['general', 'area'])),
  ]);
  const general = threads.find((t) => t.kind === 'general');
  const byArea = new Map(threads.filter((t) => t.kind === 'area' && t.areaId).map((t) => [t.areaId!, t]));
  const items: ThreadListItem[] = areaRows.map((a) => {
    const t = byArea.get(a.id);
    return { key: a.id, areaId: a.id, name: a.name, conversationId: t?.id ?? null, lastMessage: t?.last ?? null, updatedAt: t?.last ? t.updatedAt.toISOString() : null };
  });
  items.sort((x, y) => (y.updatedAt ?? '').localeCompare(x.updatedAt ?? '') || x.name.localeCompare(y.name, 'vi'));
  return [
    { key: 'general', areaId: null, name: 'Chung', conversationId: general?.id ?? null, lastMessage: general?.last ?? null, updatedAt: general?.last ? general.updatedAt.toISOString() : null },
    ...items,
  ];
}

/** "Lưu trữ": conversations from before threads, and those Jarvis wrote itself (weekly reviews). */
export async function listArchivedConversations(db: DbOrTx, limit = 100): Promise<ConversationRow[]> {
  return db.select().from(conversations).where(inArray(conversations.kind, ['legacy', 'system'])).orderBy(desc(conversations.updatedAt)).limit(limit);
}

/** Saves a message and touches the conversation's `updated_at` in one transaction. */
export async function appendMessage(
  db: DbOrTx,
  conversationId: string,
  role: MessageRow['role'],
  content: string,
  metadata?: unknown,
): Promise<MessageRow> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(messages)
      .values({ conversationId, role, content, metadata: metadata ?? null })
      .returning();
    await tx.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
    return row;
  });
}

/** `(created_at, id)` of messages compared with that of message `id`, in SQL (timestamps keep microseconds there). */
const relativeTo = (op: '<' | '>', id: string) =>
  sql`(${messages.createdAt}, ${messages.id}) ${sql.raw(op)} (select m.created_at, m.id from messages m where m.id = ${id})`;

/** Messages of the conversation strictly before message `messageId`, oldest first. */
export async function listMessagesBefore(db: DbOrTx, conversationId: string, messageId: string): Promise<MessageRow[]> {
  return db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), relativeTo('<', messageId)))
    .orderBy(messages.createdAt, messages.id);
}

/**
 * Regenerate's save: in one transaction, drops the assistant replies after user message `userMessageId`
 * and saves the new reply, so a failed or stopped regenerate leaves the old reply in place.
 */
export async function replaceReplies(
  db: DbOrTx,
  conversationId: string,
  userMessageId: string,
  content: string,
  metadata?: unknown,
): Promise<MessageRow> {
  return db.transaction(async (tx) => {
    await tx
      .delete(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.role, 'assistant'), relativeTo('>', userMessageId)));
    return appendMessage(tx, conversationId, 'assistant', content, metadata);
  });
}

export async function updateMessageReply(
  db: DbOrTx,
  messageId: string,
  patch: { content?: string; metadata?: unknown },
): Promise<void> {
  const values: { content?: string; metadata?: unknown } = {};
  if (patch.content !== undefined) values.content = patch.content;
  if (patch.metadata !== undefined) values.metadata = patch.metadata;
  if (Object.keys(values).length === 0) return;
  await db.update(messages).set(values).where(eq(messages.id, messageId));
}

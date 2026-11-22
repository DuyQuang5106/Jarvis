import { desc, eq } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import { conversations, messages, type ConversationRow, type MessageRow } from '@/db/schema';
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
  const rows = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt);
  return { conversation, messages: rows };
}

export async function renameConversation(db: DbOrTx, id: string, title: string): Promise<void> {
  const t = title.trim();
  if (t.length < 1 || t.length > 200) throw new ValidationError('Tiêu đề phải dài 1–200 ký tự.');
  const rows = await db
    .update(conversations)
    .set({ title: t, updatedAt: new Date() })
    .where(eq(conversations.id, id))
    .returning({ id: conversations.id });
  if (rows.length === 0) throw new NotFoundError('Không tìm thấy cuộc trò chuyện.');
}

export async function deleteConversation(db: DbOrTx, id: string): Promise<void> {
  const rows = await db.delete(conversations).where(eq(conversations.id, id)).returning({ id: conversations.id });
  if (rows.length === 0) throw new NotFoundError('Không tìm thấy cuộc trò chuyện.');
}

export async function createConversation(db: DbOrTx, title: string): Promise<ConversationRow> {
  const [row] = await db.insert(conversations).values({ title }).returning();
  return row;
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

export async function deleteMessage(db: DbOrTx, id: string): Promise<void> {
  await db.delete(messages).where(eq(messages.id, id));
}

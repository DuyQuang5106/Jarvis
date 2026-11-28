import { and, asc, eq, inArray, lte, ne } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import { areas, reminders, type ReminderRow } from '@/db/schema';
import { NotFoundError } from '../errors';

export type ReminderView = { id: string; text: string; remindAt: string; areaName: string | null };

export async function createReminder(db: DbOrTx, input: { text: string; remindAt: Date; areaId?: string | null }): Promise<ReminderRow> {
  const [row] = await db.insert(reminders).values({ text: input.text.trim(), remindAt: input.remindAt, areaId: input.areaId ?? null }).returning();
  return row;
}

/** Reminders whose time has come and that are not done yet (pushed ones included): what the chat card shows. */
export async function dueReminders(db: DbOrTx, now: Date): Promise<ReminderView[]> {
  const rows = await db
    .select({ id: reminders.id, text: reminders.text, remindAt: reminders.remindAt, areaName: areas.name })
    .from(reminders)
    .leftJoin(areas, eq(areas.id, reminders.areaId))
    .where(and(ne(reminders.status, 'done'), lte(reminders.remindAt, now)))
    .orderBy(asc(reminders.remindAt));
  return rows.map((r) => ({ id: r.id, text: r.text, remindAt: r.remindAt.toISOString(), areaName: r.areaName ?? null }));
}

/** Not yet pushed and due: what a notification tick sends (N3b). */
export async function unsentDue(db: DbOrTx, now: Date): Promise<ReminderRow[]> {
  return db.select().from(reminders).where(and(eq(reminders.status, 'pending'), lte(reminders.remindAt, now))).orderBy(asc(reminders.remindAt));
}

export async function markSent(db: DbOrTx, ids: string[], now: Date): Promise<void> {
  if (ids.length === 0) return;
  await db.update(reminders).set({ status: 'sent', sentAt: now }).where(and(inArray(reminders.id, ids), eq(reminders.status, 'pending')));
}

export async function markDone(db: DbOrTx, id: string): Promise<void> {
  const [row] = await db.update(reminders).set({ status: 'done' }).where(eq(reminders.id, id)).returning({ id: reminders.id });
  if (!row) throw new NotFoundError('Không tìm thấy lời nhắc.');
}

/** "Nhắc lại sau 1 giờ": due again later, and pushed again then. */
export async function snooze(db: DbOrTx, id: string, now: Date, minutes = 60): Promise<void> {
  const [row] = await db
    .update(reminders)
    .set({ status: 'pending', remindAt: new Date(now.getTime() + minutes * 60_000), sentAt: null })
    .where(eq(reminders.id, id))
    .returning({ id: reminders.id });
  if (!row) throw new NotFoundError('Không tìm thấy lời nhắc.');
}

import { beforeEach, expect, test } from 'vitest';
import type { Db } from '@/db/client';
import { reminders } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { approvePendingAction } from '../proposals/resolve';
import type { StoredProposal } from '../proposals/schema';
import { createPendingAction } from '../proposals/store';
import { pendingActions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { dueReminders, markDone, markSent, snooze, unsentDue } from './reminders';

let db: Db;
beforeEach(async () => { db = await createTestDb(); });

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

test('đề xuất nhắc việc: duyệt xong thì có lời nhắc; giờ đã qua thì bị bỏ khỏi đề xuất', async () => {
  const ok = await createPendingAction(db, {
    source: 'chat',
    proposal: {
      summary: 'Nhắc',
      actions: [
        { type: 'create_reminder', text: 'Chốt nguồn tài liệu', remindAt: inHours(3) },
        { type: 'create_reminder', text: 'Đã qua', remindAt: inHours(-2) },
      ],
    },
  });
  if (!ok.ok) throw new Error(ok.reason);
  const [row] = await db.select().from(pendingActions).where(eq(pendingActions.id, ok.id));
  const stored = row.actionsJson as StoredProposal;
  expect(stored.actions.map((a) => (a.action as { text: string }).text)).toEqual(['Chốt nguồn tài liệu']);
  expect(await approvePendingAction(db, ok.id, { selectedKeys: stored.actions.map((a) => a.key) })).toMatchObject({ status: 'applied' });
  const saved = await db.select().from(reminders);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ text: 'Chốt nguồn tài liệu', status: 'pending' });
});

test('đến giờ: hiện, gửi một lần, nhắc lại sau, xong', async () => {
  const [r] = await db.insert(reminders).values({ text: 'Ôn CRC', remindAt: new Date('2026-11-28T13:00:00Z') }).returning();
  const before = new Date('2026-11-28T12:59:00Z');
  const after = new Date('2026-11-28T13:05:00Z');
  expect(await dueReminders(db, before)).toEqual([]);
  expect((await dueReminders(db, after)).map((x) => x.text)).toEqual(['Ôn CRC']);

  expect((await unsentDue(db, after)).map((x) => x.id)).toEqual([r.id]);
  await markSent(db, [r.id], after);
  expect(await unsentDue(db, after)).toEqual([]);
  // Sent but not dismissed: the chat card still shows it.
  expect(await dueReminders(db, after)).toHaveLength(1);

  await snooze(db, r.id, after);
  expect(await dueReminders(db, after)).toEqual([]);
  const later = new Date(after.getTime() + 61 * 60_000);
  expect((await unsentDue(db, later)).map((x) => x.id)).toEqual([r.id]);

  await markDone(db, r.id);
  expect(await dueReminders(db, later)).toEqual([]);
});

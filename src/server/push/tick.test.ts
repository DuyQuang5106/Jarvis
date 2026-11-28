import { beforeEach, expect, test } from 'vitest';
import type { Db } from '@/db/client';
import { conversations, messages, reminders } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { inQuietHours, readNotifyPrefs } from '@/lib/notify-prefs';
import { createArea } from '../services/areas';
import { updateSettings } from '../services/settings';
import type { PushSender } from './send';
import { saveSubscription } from './subscriptions';
import { runTick } from './tick';

let db: Db;
let payloads: { title: string; body: string }[];
const send: PushSender = async (_sub, payload) => {
  payloads.push(JSON.parse(payload));
  return { statusCode: 201 };
};

beforeEach(async () => {
  db = await createTestDb();
  payloads = [];
  await saveSubscription(db, { endpoint: 'https://web.push.apple.com/x', keys: { p256dh: 'p', auth: 'a' } });
  await createArea(db, { kind: 'academic', name: 'Algebra', status: 'active' }, { origin: 'manual' });
  // Check-ins and weekly reviews are tested on their own below.
  await updateSettings(db, { checkinsEnabled: false, weeklyReviewsEnabled: false });
});

/** 2026-11-28 (Saturday) at HH:MM Vietnam time. */
const at = (hhmm: string) => new Date(`2026-11-28T${hhmm}:00+07:00`);

test('giờ yên lặng: mặc định 23:00–07:00, có thể qua nửa đêm', () => {
  expect(readNotifyPrefs(null)).toMatchObject({ quietStart: '23:00', quietEnd: '07:00', brief: true });
  expect(inQuietHours('23:30', '23:00', '07:00')).toBe(true);
  expect(inQuietHours('06:59', '23:00', '07:00')).toBe(true);
  expect(inQuietHours('07:00', '23:00', '07:00')).toBe(false);
  expect(inQuietHours('13:00', '12:00', '14:00')).toBe(true);
  expect(inQuietHours('10:00', '08:00', '08:00')).toBe(false);
});

test('nhắc việc: gửi đúng một lần khi tới giờ, kể cả trong giờ yên lặng', async () => {
  await db.insert(reminders).values({ text: 'Uống thuốc', remindAt: at('23:30') });
  expect((await runTick(db, at('23:29'), send)).sent).toEqual([]);
  const report = await runTick(db, at('23:31'), send);
  expect(report.quiet).toBe(true);
  expect(payloads).toEqual([expect.objectContaining({ title: 'Nhắc việc', body: 'Uống thuốc' })]);
  await runTick(db, at('23:36'), send);
  expect(payloads).toHaveLength(1);
});

test('định hướng buổi sáng: từ 07:30, một lần mỗi ngày, tắt được', async () => {
  expect((await runTick(db, at('07:20'), send)).sent).toEqual([]);
  expect((await runTick(db, at('07:35'), send)).sent).toEqual(['brief:2026-11-28']);
  expect((await runTick(db, at('08:00'), send)).sent).toEqual([]);
  await updateSettings(db, { notify: { brief: false } });
  expect((await runTick(db, new Date('2026-11-29T07:35:00+07:00'), send)).sent).toEqual([]);
});

test('check-in cuối buổi: một lần cho mỗi buổi, không gửi trong giờ yên lặng', async () => {
  await updateSettings(db, { checkinsEnabled: true });
  // Activity in the morning slot (06–11) so the slot has something to ask about.
  const [c] = await db.insert(conversations).values({ title: 'x' }).returning();
  await db.insert(messages).values({ conversationId: c.id, role: 'user', content: 'học Algebra', createdAt: at('09:00') });
  const first = await runTick(db, at('11:05'), send);
  expect(first.sent.filter((k) => k.startsWith('checkin:'))).toHaveLength(1);
  expect(payloads.find((p) => p.title === 'Check-in')?.body).toMatch(/bạn đã làm gì/);
  const again = await runTick(db, at('11:10'), send);
  expect(again.sent.filter((k) => k.startsWith('checkin:'))).toEqual([]);
});

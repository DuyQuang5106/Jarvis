import { beforeEach, expect, test, vi } from 'vitest';
import type { Db } from '@/db/client';
import { pushSubscriptions } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { ValidationError } from '../errors';
import { sendToAll, type PushSender } from './send';
import { deviceLabel, listDevices, removeSubscription, saveSubscription } from './subscriptions';

let db: Db;
beforeEach(async () => { db = await createTestDb(); });

const sub = (n: number, ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1') => ({
  endpoint: `https://web.push.apple.com/device-${n}`,
  keys: { p256dh: `p${n}`, auth: `a${n}` },
  userAgent: ua,
});

test('lưu thiết bị, đăng ký lại cùng endpoint thì thay khóa, gỡ được', async () => {
  const first = await saveSubscription(db, sub(1));
  const again = await saveSubscription(db, { ...sub(1), keys: { p256dh: 'new', auth: 'new' } });
  expect(again.id).toBe(first.id);
  const [row] = await db.select().from(pushSubscriptions);
  expect(row.p256dh).toBe('new');
  expect((await listDevices(db)).map((d) => d.label)).toEqual(['iPhone · Safari']);
  await removeSubscription(db, first.id);
  expect(await listDevices(db)).toEqual([]);
  await expect(saveSubscription(db, { endpoint: 'http://insecure.example/x', keys: { p256dh: 'p', auth: 'a' } })).rejects.toBeInstanceOf(ValidationError);
});

test('gửi tới mọi thiết bị: 410 → gỡ thiết bị, lỗi khác → chỉ đếm lỗi', async () => {
  for (const n of [1, 2, 3]) await saveSubscription(db, sub(n));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const seen: string[] = [];
  const send: PushSender = async (s, payload) => {
    seen.push(payload);
    if (s.endpoint.endsWith('device-2')) throw Object.assign(new Error('gone'), { statusCode: 410 });
    if (s.endpoint.endsWith('device-3')) throw Object.assign(new Error('boom'), { statusCode: 500 });
    return { statusCode: 201 };
  };
  const now = new Date('2026-11-28T10:00:00Z');
  const report = await sendToAll(db, { title: 'Jarvis', body: 'Thử', url: '/chat' }, send, now);
  expect(report).toEqual({ sent: 1, removed: 1, failed: 1 });
  expect(JSON.parse(seen[0])).toEqual({ title: 'Jarvis', body: 'Thử', url: '/chat' });
  const rows = await db.select().from(pushSubscriptions);
  expect(rows.map((r) => r.endpoint).sort()).toEqual(['https://web.push.apple.com/device-1', 'https://web.push.apple.com/device-3']);
  expect(rows.find((r) => r.endpoint.endsWith('1'))?.lastSuccessAt).toEqual(now);
  expect(rows.find((r) => r.endpoint.endsWith('3'))?.failedCount).toBe(1);
  // The log carries the status only, never the endpoint.
  expect(JSON.stringify(warn.mock.calls)).not.toContain('web.push.apple.com');
});

test('nhãn thiết bị', () => {
  expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36')).toBe('Windows · Chrome');
  expect(deviceLabel(null)).toBe('Thiết bị');
});

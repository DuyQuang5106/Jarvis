import { beforeEach, expect, test, vi } from 'vitest';
import type { Db } from '@/db/client';
import { reminders } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { saveSubscription } from '@/server/push/subscriptions';

let db: Db;
let env: Record<string, string> = {};
const pushed: string[] = [];
vi.mock('@/db/client', async (orig) => ({ ...(await orig<typeof import('@/db/client')>()), getDb: async () => db }));
vi.mock('@/server/config', async (orig) => {
  const m = await orig<typeof import('@/server/config')>();
  return { ...m, getConfig: () => m.loadConfig({ NODE_ENV: 'test', ...env }) };
});
vi.mock('@/server/push/send', async (orig) => {
  const m = await orig<typeof import('@/server/push/send')>();
  return {
    ...m,
    webPushSender: () => (m.vapidConfig() ? async (_s: unknown, payload: string) => { pushed.push(payload); return { statusCode: 201 }; } : null),
  };
});
vi.mock('next/server', () => ({ connection: async () => {} }));

import { POST } from './route';

const call = (auth?: string) => POST(new Request('http://x/api/cron/tick', { method: 'POST', headers: auth ? { authorization: auth } : {} }));

beforeEach(async () => {
  db = await createTestDb();
  pushed.length = 0;
  env = { CRON_SECRET: 's3cret', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:a@b.c' };
  await saveSubscription(db, { endpoint: 'https://web.push.apple.com/x', keys: { p256dh: 'p', auth: 'a' } });
});

test('sai hoặc thiếu khóa: 401, không gửi gì', async () => {
  await db.insert(reminders).values({ text: 'Việc', remindAt: new Date(Date.now() - 60_000) });
  expect((await call()).status).toBe(401);
  expect((await call('Bearer wrong!')).status).toBe(401);
  env = { ...env, CRON_SECRET: '' };
  expect((await call('Bearer ')).status).toBe(401);
  expect(pushed).toEqual([]);
});

test('đúng khóa: gửi lời nhắc tới hạn; chưa có khóa VAPID thì bỏ qua và nói rõ', async () => {
  const [r] = await db.insert(reminders).values({ text: 'Việc', remindAt: new Date(Date.now() - 60_000) }).returning();
  const res = await call('Bearer s3cret');
  expect(res.status).toBe(200);
  expect((await res.json()).sent).toContain(`reminder:${r.id}`);
  // Other kinds (a check-in, the morning brief) may be due at the real clock too: the reminder is the one checked.
  expect(pushed.filter((p) => JSON.parse(p).title === 'Nhắc việc')).toHaveLength(1);

  env = { CRON_SECRET: 's3cret' };
  expect(await (await call('Bearer s3cret')).json()).toEqual({ sent: [], skipped: 'no-vapid-keys' });
});

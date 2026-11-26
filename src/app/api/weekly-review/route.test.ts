import { beforeEach, expect, test, vi } from 'vitest';
import type { Db } from '@/db/client';
import { conversations, messages, weeklyReviews } from '@/db/schema';
import { createTestDb } from '@/db/testing';

let db: Db;
const resolveOwner = vi.fn();
vi.mock('@/db/client', async (orig) => ({ ...(await orig<typeof import('@/db/client')>()), getDb: async () => db }));
vi.mock('@/server/owner', async (orig) => ({ ...(await orig<typeof import('@/server/owner')>()), resolveOwner: (...a: unknown[]) => resolveOwner(...a) }));
vi.mock('@/server/config', async (orig) => {
  const m = await orig<typeof import('@/server/config')>();
  return { ...m, getConfig: () => ({ ...m.loadConfig({ NODE_ENV: 'test' }), aiProvider: 'mock' as const, aiActionMode: 'tools' as const, e2e: true }) };
});
vi.mock('next/server', () => ({ connection: async () => {} }));

import { GET, POST } from './route';

/** Sunday 16/03/2025 19:00 in Asia/Ho_Chi_Minh. */
const headers = { 'x-e2e-now': '2025-03-16T12:00:00.000Z' };

beforeEach(async () => {
  db = await createTestDb();
  resolveOwner.mockReset();
  resolveOwner.mockResolvedValue({ email: 'dev@local' });
});

const get = () => GET(new Request('http://localhost/api/weekly-review', { headers }));
const post = (body: unknown) =>
  POST(new Request('http://localhost/api/weekly-review', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }));

test('chưa đăng nhập -> 401; body sai -> 400', async () => {
  resolveOwner.mockResolvedValue(null);
  expect((await get()).status).toBe(401);
  expect((await post({ week: 'due' })).status).toBe(401);
  resolveOwner.mockResolvedValue({ email: 'dev@local' });
  expect((await post({ week: 'nope' })).status).toBe(400);
});

test('GET mời tuần có hoạt động; POST sinh một lần rồi trả bản đã lưu; GET sau đó là thẻ sẵn sàng', async () => {
  expect(await (await get()).json()).toEqual({ card: null });
  const [c] = await db.insert(conversations).values({ title: 't' }).returning();
  await db.insert(messages).values({ conversationId: c.id, role: 'user', content: 'Ôn chương 5', createdAt: new Date('2025-03-12T02:00:00Z') });
  expect(await (await get()).json()).toEqual({ card: { state: 'pending', weekStart: '2025-03-10', label: '10/03–16/03' } });

  const first = await (await post({ week: 'due' })).json();
  expect(first.review).toMatchObject({ weekStart: '2025-03-10', conversationId: expect.any(String) });
  expect(await (await post({ week: 'due' })).json()).toEqual(first);
  expect(await db.select().from(weeklyReviews)).toHaveLength(1);
  // No state document to compress: no proposal, so nothing waits and the card is gone.
  expect(first.review.pendingActionId).toBeNull();
  expect(await (await get()).json()).toEqual({ card: null });
});

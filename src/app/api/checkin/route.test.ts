import { beforeEach, expect, test, vi } from 'vitest';
import type { Db } from '@/db/client';
import { conversations, messages } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import type { StreamRequest } from '@/server/ai/provider';

let db: Db;
let e2e = true;
const calls: StreamRequest[] = [];
const resolveOwner = vi.fn();
vi.mock('@/db/client', async (orig) => ({ ...(await orig<typeof import('@/db/client')>()), getDb: async () => db }));
vi.mock('@/server/owner', async (orig) => ({ ...(await orig<typeof import('@/server/owner')>()), resolveOwner: (...a: unknown[]) => resolveOwner(...a) }));
vi.mock('@/server/config', async (orig) => {
  const m = await orig<typeof import('@/server/config')>();
  return { ...m, getConfig: () => ({ ...m.loadConfig({ NODE_ENV: 'test' }), aiProvider: 'mock' as const, e2e }) };
});
vi.mock('@/server/ai/provider', async (orig) => {
  const m = await orig<typeof import('@/server/ai/provider')>();
  return { ...m, getProvider: () => ({ stream: (req: StreamRequest) => { calls.push(req); return m.getProvider().stream(req); } }) };
});
vi.mock('next/server', () => ({ connection: async () => {} }));

import { GET, POST } from './route';

/** 11:30 on 10/03/2025 in Asia/Ho_Chi_Minh. */
const NOW = '2025-03-10T04:30:00.000Z';
const headers = { 'x-e2e-now': NOW };

beforeEach(async () => {
  db = await createTestDb();
  e2e = true;
  calls.length = 0;
  resolveOwner.mockReset();
  resolveOwner.mockResolvedValue({ email: 'dev@local' });
});

const get = (h: Record<string, string> = headers) => GET(new Request('http://localhost/api/checkin', { headers: h }));
const post = (body: unknown, h: Record<string, string> = headers) =>
  POST(new Request('http://localhost/api/checkin', { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(body) }));

test('chưa đăng nhập -> 401 cho cả GET và POST', async () => {
  resolveOwner.mockResolvedValue(null);
  expect((await get()).status).toBe(401);
  expect((await post({ action: 'skip', slots: [] })).status).toBe(401);
});

test('GET: buổi không hoạt động -> thẻ hỏi, không gọi AI', async () => {
  const res = await get();
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.checkin).toMatchObject({ day: '2025-03-10', hasActivity: false, label: 'Sáng nay' }); // first use: today's slots only
  expect(calls).toHaveLength(0);
});

test('GET: có hoạt động -> tóm tắt bằng AI, lần sau dùng bản đã lưu', async () => {
  const [c] = await db.insert(conversations).values({ title: 't' }).returning();
  await db.insert(messages).values({ conversationId: c.id, role: 'user', content: 'Ôn chương 5', createdAt: new Date('2025-03-10T02:00:00Z') });
  const first = await (await get()).json();
  expect(first.checkin.summary.items).toHaveLength(1);
  expect(calls).toHaveLength(1);
  expect(await (await get()).json()).toEqual(first);
  expect(calls).toHaveLength(1);
});

test('POST: đánh dấu xong thì GET không còn thẻ; body sai -> 400; buổi chưa kết thúc -> 409', async () => {
  const { checkin } = await (await get()).json();
  expect((await post({ action: 'nope', slots: checkin.slots })).status).toBe(400);
  expect((await post({ action: 'skip', slots: [{ day: '2025-02-30', slot: 'morning' }] })).status).toBe(400);
  expect((await post({ action: 'skip', slots: [{ day: '2025-03-10', slot: 'evening' }] })).status).toBe(409);
  expect((await post({ action: 'skip', slots: checkin.slots })).status).toBe(204);
  expect(await (await get()).json()).toEqual({ checkin: null });
});

test('header giờ giả bị bỏ qua khi không chạy E2E', async () => {
  e2e = false;
  const { requestNow } = await import('@/server/request-now');
  const before = Date.now();
  const now = requestNow(new Headers(headers)).getTime();
  expect(now).toBeGreaterThanOrEqual(before);
  e2e = true;
  expect(requestNow(new Headers(headers)).toISOString()).toBe(NOW);
  expect(requestNow(new Headers({ 'x-e2e-now': 'not-a-date' })).getTime()).toBeGreaterThanOrEqual(before);
});

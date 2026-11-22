import { beforeEach, expect, test, vi } from 'vitest';
import type { Db } from '@/db/client';
import { createTestDb } from '@/db/testing';
import type { StreamRequest } from '@/server/ai/provider';

let db: Db;
let seenSignal: AbortSignal | undefined;
const resolveOwner = vi.fn();
vi.mock('@/db/client', async (orig) => ({ ...(await orig<typeof import('@/db/client')>()), getDb: async () => db }));
vi.mock('@/server/owner', async (orig) => ({ ...(await orig<typeof import('@/server/owner')>()), resolveOwner: (...a: unknown[]) => resolveOwner(...a) }));
vi.mock('@/server/config', async (orig) => {
  const m = await orig<typeof import('@/server/config')>();
  return { ...m, getConfig: () => ({ ...m.loadConfig({ NODE_ENV: 'test' }), aiProvider: 'mock' as const }) };
});
vi.mock('@/server/ai/provider', async (orig) => {
  const m = await orig<typeof import('@/server/ai/provider')>();
  return {
    ...m,
    getProvider: () => {
      const real = m.getProvider();
      return { stream: (req: StreamRequest) => { seenSignal = req.signal; return real.stream(req); } };
    },
  };
});
vi.mock('next/server', () => ({ connection: async () => {} }));

import { POST } from './route';

beforeEach(async () => {
  db = await createTestDb();
  seenSignal = undefined;
  resolveOwner.mockReset();
  resolveOwner.mockResolvedValue({ email: 'dev@local' });
});

const post = (body: unknown, init: { headers?: Record<string, string>; raw?: boolean } = {}) =>
  POST(new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...init.headers },
    body: init.raw ? (body as string) : JSON.stringify(body),
  }));

test('chưa đăng nhập -> 401', async () => {
  resolveOwner.mockResolvedValue(null);
  expect((await post({ message: 'x', scope: { mode: 'auto' } })).status).toBe(401);
});

test('body sai -> 400', async () => {
  const res = await post({ scope: { mode: 'sai' } });
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: 'bad_request' });
});

test('JSON hỏng -> 400', async () => {
  expect((await post('{nope', { raw: true })).status).toBe(400);
});

test('body quá 64 KB -> 400', async () => {
  expect((await post({ message: 'a'.repeat(70_000), scope: { mode: 'auto' } })).status).toBe(400);
});

test('content-length khai quá 64 KB -> 400 trước khi đọc body', async () => {
  const req = new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': String(64 * 1024 + 1) },
    body: JSON.stringify({ message: 'x', scope: { mode: 'auto' } }),
  });
  const text = vi.spyOn(req, 'text');
  const res = await POST(req);
  expect(res.status).toBe(400);
  expect(text).not.toHaveBeenCalled();
});

test('POST khác origin -> 403', async () => {
  const res = await post({ message: 'x', scope: { mode: 'auto' } }, { headers: { origin: 'http://evil.example' } });
  expect(res.status).toBe(403);
});

test('hợp lệ -> 200 NDJSON kết thúc bằng done, truyền req.signal xuống provider', async () => {
  const res = await post({ message: 'xin chào', scope: { mode: 'auto' } });
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('application/x-ndjson');
  expect(res.headers.get('cache-control')).toBe('no-store');
  const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
  expect(lines[0].type).toBe('meta');
  expect(lines.at(-1).type).toBe('done');
  expect(seenSignal).toBeInstanceOf(AbortSignal);
});

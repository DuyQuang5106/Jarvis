import { beforeEach, expect, test, vi } from 'vitest';

const session = vi.hoisted(() => ({ email: null as string | null }));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock('./supabase', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: session.email ? { email: session.email } : null } }) },
  }),
}));
vi.mock('./config', async (orig) => {
  const actual = await orig<typeof import('./config')>();
  const cfg = actual.loadConfig({
    NODE_ENV: 'production',
    DATABASE_URL: 'x',
    NEXT_PUBLIC_SUPABASE_URL: 'x',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'x',
    APP_OWNER_EMAIL: 'me@example.com',
  });
  return { ...actual, getConfig: () => cfg };
});

import { requireOwner, withOwner } from './auth';

const handler = vi.fn(async () => new Response('ok'));
const wrapped = withOwner(handler);
const call = (init: RequestInit = {}) =>
  wrapped(new Request('https://app.example.com/api/x', { method: 'GET', ...init }), {});

beforeEach(() => {
  handler.mockClear();
  session.email = null;
});

test('không có phiên: 401 và không gọi handler', async () => {
  const res = await call();
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: 'unauthorized' });
  expect(handler).not.toHaveBeenCalled();
});

test('phiên không phải owner: 401', async () => {
  session.email = 'other@example.com';
  expect((await call()).status).toBe(401);
  expect(handler).not.toHaveBeenCalled();
});

test('owner + GET: gọi handler với owner', async () => {
  session.email = 'Me@example.com';
  const res = await call();
  expect(res.status).toBe(200);
  expect(handler).toHaveBeenCalledWith(expect.any(Request), { email: 'me@example.com' }, {});
});

test('owner + POST khác origin: 403 và không gọi handler', async () => {
  session.email = 'me@example.com';
  const res = await call({ method: 'POST', headers: { host: 'app.example.com', origin: 'https://evil.example.net' } });
  expect(res.status).toBe(403);
  expect(await res.json()).toEqual({ error: 'forbidden' });
  expect(handler).not.toHaveBeenCalled();
});

test('owner + POST cùng origin: gọi handler', async () => {
  session.email = 'me@example.com';
  const res = await call({ method: 'POST', headers: { host: 'app.example.com', origin: 'https://app.example.com' } });
  expect(res.status).toBe(200);
});

test('requireOwner chuyển về /login khi chưa đăng nhập', async () => {
  await expect(requireOwner()).rejects.toThrow('NEXT_REDIRECT:/login');
});

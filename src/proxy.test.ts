import { beforeEach, expect, test, vi } from 'vitest';

type SetAll = (c: unknown[], h: Record<string, string>) => void;

const state = vi.hoisted(() => ({
  authMode: 'supabase' as 'supabase' | 'dev',
  user: null as { email: string } | null,
  getUserThrows: false,
  refreshCookies: true,
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_u: string, _k: string, opts: { cookies: { setAll: SetAll } }) => ({
    auth: {
      getUser: async () => {
        if (state.getUserThrows) throw new Error('fetch failed');
        if (state.refreshCookies) {
          opts.cookies.setAll([{ name: 'sb-token', value: 'abc', options: { path: '/' } }], {
            'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
            Expires: '0',
            Pragma: 'no-cache',
          });
          // later call passes no headers; they must survive the response being recreated
          opts.cookies.setAll([{ name: 'sb-token', value: 'def', options: { path: '/' } }], {});
        }
        return { data: { user: state.user }, error: state.user ? null : { name: 'AuthSessionMissingError', status: 400 } };
      },
    },
  }),
}));
vi.mock('@/server/config', () => ({
  getConfig: () => ({ authMode: state.authMode, supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon' }),
}));

import { NextRequest } from 'next/server';
import { proxy } from './proxy';

const call = (path: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  proxy(new NextRequest(`https://app.example.com${path}`, init));

beforeEach(() => {
  state.authMode = 'supabase';
  state.user = null;
  state.getUserThrows = false;
  state.refreshCookies = true;
});

test('phản hồi mang cookie phiên phải kèm Cache-Control no-store', async () => {
  const res = await call('/login');
  expect(res.cookies.get('sb-token')?.value).toBe('def');
  expect(res.headers.get('cache-control')).toContain('no-store');
  expect(res.headers.get('pragma')).toBe('no-cache');
  expect(res.headers.get('expires')).toBe('0');
});

test.each(['/chat', '/context?tab=projects', '/'])('chưa đăng nhập: trang %s chuyển về /login', async (path) => {
  const res = await call(path);
  expect(res.status).toBe(307);
  expect(new URL(res.headers.get('location')!).pathname).toBe('/login');
});

test('chưa đăng nhập: request RSC (segment prefetch) cũng chuyển về /login', async () => {
  const res = await call('/context', {
    headers: { RSC: '1', 'Next-Router-Prefetch': '1', 'Next-Router-Segment-Prefetch': '/!KGFwcCk/context/__PAGE__' },
  });
  expect(res.status).toBe(307);
  expect(new URL(res.headers.get('location')!).pathname).toBe('/login');
});

test('redirect vẫn mang cookie phiên đã làm mới và header no-store', async () => {
  const res = await call('/chat');
  expect(res.status).toBe(307);
  expect(res.cookies.get('sb-token')?.value).toBe('def');
  expect(res.headers.get('cache-control')).toContain('no-store');
});

test('getUser() ném lỗi (Supabase không với tới) được coi là chưa đăng nhập', async () => {
  state.getUserThrows = true;
  const res = await call('/chat');
  expect(res.status).toBe(307);
  expect(new URL(res.headers.get('location')!).pathname).toBe('/login');
});

test('có phiên: không chuyển hướng', async () => {
  state.user = { email: 'me@example.com' };
  const res = await call('/chat');
  expect(res.headers.get('location')).toBeNull();
  expect(res.headers.get('x-middleware-next')).toBe('1');
});

test.each(['/api/export', '/api/test/reset', '/login', '/manifest.webmanifest', '/icons/icon-192.png', '/favicon.ico'])(
  'chưa đăng nhập: %s không bị chuyển hướng',
  async (path) => {
    const res = await call(path);
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-middleware-next')).toBe('1');
  },
);

test('AUTH_MODE=dev: không chuyển hướng', async () => {
  state.authMode = 'dev';
  const res = await call('/chat');
  expect(res.headers.get('location')).toBeNull();
});

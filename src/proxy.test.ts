import { expect, test, vi } from 'vitest';

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_u: string, _k: string, opts: { cookies: { setAll: (c: unknown[], h: Record<string, string>) => void } }) => ({
    auth: {
      getUser: async () => {
        opts.cookies.setAll([{ name: 'sb-token', value: 'abc', options: { path: '/' } }], {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
          Expires: '0',
          Pragma: 'no-cache',
        });
        // later call passes no headers; they must survive the response being recreated
        opts.cookies.setAll([{ name: 'sb-token', value: 'def', options: { path: '/' } }], {});
        return { data: { user: null } };
      },
    },
  }),
}));
vi.mock('@/server/config', () => ({
  getConfig: () => ({ authMode: 'supabase', supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon' }),
}));

import { NextRequest } from 'next/server';
import { proxy } from './proxy';

test('phản hồi mang cookie phiên phải kèm Cache-Control no-store', async () => {
  const res = await proxy(new NextRequest('https://app.example.com/login'));
  expect(res.cookies.get('sb-token')?.value).toBe('def');
  expect(res.headers.get('cache-control')).toContain('no-store');
  expect(res.headers.get('pragma')).toBe('no-cache');
  expect(res.headers.get('expires')).toBe('0');
});

import { afterEach, beforeEach, expect, test, vi } from 'vitest';

type AuthErr = { status?: number; code?: string; name: string; message: string };

const auth = vi.hoisted(() => ({
  result: { data: { user: null as { email: string } | null }, error: null as AuthErr | null },
  signInWithPassword: vi.fn(),
  signOut: vi.fn<(opts?: { scope: string }) => Promise<{ error: null }>>(async () => ({ error: null })),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock('@/server/supabase', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      signInWithPassword: async (creds: unknown) => {
        auth.signInWithPassword(creds);
        return auth.result;
      },
      signOut: auth.signOut,
    },
  }),
}));
vi.mock('@/server/config', async (orig) => {
  const actual = await orig<typeof import('@/server/config')>();
  const cfg = actual.loadConfig({
    NODE_ENV: 'production',
    DATABASE_URL: 'x',
    NEXT_PUBLIC_SUPABASE_URL: 'x',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'x',
    APP_OWNER_EMAIL: 'me@example.com',
  });
  return { ...actual, getConfig: () => cfg };
});

import { signIn, signOut } from './actions';

const BAD_CREDENTIALS = 'Email hoặc mật khẩu không đúng.';
const SERVICE_DOWN = 'Không kết nối được dịch vụ đăng nhập, thử lại.';
const EMAIL = 'someone@example.com';
const PASSWORD = 'hunter2-secret';

function form(email = EMAIL, password = PASSWORD): FormData {
  const f = new FormData();
  f.set('email', email);
  f.set('password', password);
  return f;
}

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  auth.result = { data: { user: null }, error: null };
  auth.signInWithPassword.mockClear();
  auth.signOut.mockClear();
  logged = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  logged.mockRestore();
});

test('sai email/mật khẩu: báo sai thông tin đăng nhập', async () => {
  auth.result.error = { status: 400, code: 'invalid_credentials', name: 'AuthApiError', message: 'Invalid login credentials' };
  expect(await signIn({}, form())).toEqual({ error: BAD_CREDENTIALS });
  expect(auth.signOut).not.toHaveBeenCalled();
});

test.each([
  { status: 0, code: undefined, name: 'AuthRetryableFetchError', message: 'fetch failed' },
  { status: 503, code: undefined, name: 'AuthRetryableFetchError', message: 'Service Unavailable' },
  { status: 500, code: 'unexpected_failure', name: 'AuthApiError', message: 'Database error' },
])('lỗi mạng/5xx ($name $status): báo lỗi dịch vụ và log không có email', async (err) => {
  auth.result.error = err;
  expect(await signIn({}, form())).toEqual({ error: SERVICE_DOWN });
  expect(logged).toHaveBeenCalled();
  const text = JSON.stringify(logged.mock.calls);
  expect(text).toContain(err.name);
  expect(text).not.toContain(EMAIL);
  expect(text).not.toContain(PASSWORD);
});

test('đăng nhập đúng nhưng không phải owner: đăng xuất local và báo sai thông tin', async () => {
  auth.result.data.user = { email: EMAIL };
  expect(await signIn({}, form())).toEqual({ error: BAD_CREDENTIALS });
  expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
});

test('owner: chuyển tới /chat', async () => {
  auth.result.data.user = { email: 'Me@Example.com' };
  await expect(signIn({}, form('me@example.com'))).rejects.toThrow('NEXT_REDIRECT:/chat');
  expect(auth.signOut).not.toHaveBeenCalled();
});

test('signOut chỉ đăng xuất phiên local rồi về /login', async () => {
  await expect(signOut()).rejects.toThrow('NEXT_REDIRECT:/login');
  expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
});

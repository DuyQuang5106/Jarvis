import { expect, test } from 'vitest';
import { assertSafeConfig, loadConfig } from './config';

const prod = { NODE_ENV: 'production', DATABASE_URL: 'postgres://x', NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon', APP_OWNER_EMAIL: 'me@example.com' };

test('mặc định ngoài production là pglite + dev + mock', () => {
  expect(loadConfig({ NODE_ENV: 'development' })).toMatchObject({ dbDriver: 'pglite', authMode: 'dev', aiProvider: 'mock', aiActionMode: 'off', aiDailyRequestCap: 200 });
});

test('mặc định production là postgres + supabase', () => {
  const cfg = loadConfig(prod);
  expect(cfg).toMatchObject({ dbDriver: 'postgres', authMode: 'supabase' });
  expect(() => assertSafeConfig(cfg)).not.toThrow();
});

test.each([
  [{ AUTH_MODE: 'dev' }, /AUTH_MODE=dev/],
  [{ DB_DRIVER: 'pglite' }, /DB_DRIVER=pglite/],
  [{ E2E: '1' }, /E2E=1/],
])('production từ chối %o', (extra, message) => {
  expect(() => assertSafeConfig(loadConfig({ ...prod, ...extra }))).toThrow(message);
});

test('production thiếu biến bắt buộc thì nêu tên biến', () => {
  expect(() => assertSafeConfig(loadConfig({ NODE_ENV: 'production' }))).toThrow(/DATABASE_URL/);
  expect(() => assertSafeConfig(loadConfig({ ...prod, APP_OWNER_EMAIL: undefined }))).toThrow(/APP_OWNER_EMAIL/);
});

test('giá trị enum sai bị từ chối khi load', () => {
  expect(() => loadConfig({ NODE_ENV: 'development', AI_ACTION_MODE: 'auto' })).toThrow(/AI_ACTION_MODE/);
});

test('mọi vấn đề được gom vào một lỗi, cờ dev đứng trước biến thiếu', () => {
  let message = '';
  try {
    assertSafeConfig(loadConfig({ NODE_ENV: 'production', E2E: '1' }));
  } catch (e) {
    message = (e as Error).message;
  }
  for (const s of ['E2E=1', 'DATABASE_URL']) expect(message).toContain(s);
  expect(message.indexOf('E2E=1')).toBeLessThan(message.indexOf('DATABASE_URL'));
});

test('ngoài production không bao giờ ném lỗi', () => {
  expect(() => assertSafeConfig(loadConfig({ NODE_ENV: 'development', E2E: '1' }))).not.toThrow();
});

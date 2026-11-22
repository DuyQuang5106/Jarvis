import { expect, test, vi } from 'vitest';
import { loadConfig } from './config';
import { isOwnerEmail, isSameOrigin, resolveOwner } from './owner';

test('isSameOrigin', () => {
  const req = (headers: Record<string, string>) => new Request('https://app.example.com/api/chat', { method: 'POST', headers });
  expect(isSameOrigin(req({ host: 'app.example.com' }))).toBe(true);
  expect(isSameOrigin(req({ host: 'app.example.com', origin: 'https://app.example.com' }))).toBe(true);
  expect(isSameOrigin(req({ host: 'app.example.com', origin: 'https://evil.example.net' }))).toBe(false);
  expect(isSameOrigin(req({ host: 'app.example.com', origin: 'null' }))).toBe(false);
});

test('isOwnerEmail bỏ qua hoa thường và khoảng trắng', () => {
  expect(isOwnerEmail(' Me@Example.com ', 'me@example.com')).toBe(true);
  expect(isOwnerEmail('other@example.com', 'me@example.com')).toBe(false);
  expect(isOwnerEmail(null, 'me@example.com')).toBe(false);
  expect(isOwnerEmail('me@example.com', undefined)).toBe(false);
});

const supa = loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'x', NEXT_PUBLIC_SUPABASE_URL: 'x', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'x', APP_OWNER_EMAIL: 'me@example.com' });

test('chế độ supabase: chỉ email owner được nhận', async () => {
  expect(await resolveOwner(supa, async () => 'ME@example.com')).toEqual({ email: 'me@example.com' });
  expect(await resolveOwner(supa, async () => 'other@example.com')).toBeNull();
  expect(await resolveOwner(supa, async () => null)).toBeNull();
});

test('chế độ dev: không đọc phiên', async () => {
  const getSessionEmail = vi.fn(async () => null);
  expect(await resolveOwner(loadConfig({ NODE_ENV: 'development' }), getSessionEmail)).toEqual({ email: 'dev@local' });
  expect(getSessionEmail).not.toHaveBeenCalled();
});

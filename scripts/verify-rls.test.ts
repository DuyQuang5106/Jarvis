import { expect, test } from 'vitest';
import { checkRls } from './verify-rls';

const run = (responder: (table: string) => Response) =>
  checkRls({ supabaseUrl: 'https://x.supabase.co', anonKey: 'anon', tables: ['areas', 'tasks'],
    fetch: (async (url: RequestInfo | URL) => responder(String(url).split('/rest/v1/')[1].split('?')[0])) as typeof fetch });

test('mảng rỗng hoặc lỗi quyền là đạt', async () => {
  const out = await run((t) => t === 'areas' ? new Response('[]', { status: 200 }) : new Response('{"code":"42501","message":"permission denied for table tasks"}', { status: 401 }));
  expect(out.map((r) => r.ok)).toEqual([true, true]);
});

test('trả về dòng dữ liệu là trượt và nêu tên bảng', async () => {
  const out = await run((t) => new Response(t === 'tasks' ? '[{"id":"1"}]' : '[]', { status: 200 }));
  expect(out.find((r) => r.table === 'tasks')).toMatchObject({ ok: false });
});

test('lỗi mạng là trượt (fail closed), không ném lỗi', async () => {
  const out = await checkRls({
    supabaseUrl: 'https://x.supabase.co', anonKey: 'anon', tables: ['areas'],
    fetch: (async () => { throw new Error('ECONNREFUSED'); }) as typeof fetch,
  });
  expect(out[0]).toMatchObject({ table: 'areas', ok: false });
  expect(out[0].detail).toContain('ECONNREFUSED');
});

test('gửi đúng URL và header, không lộ anon key trong detail', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const out = await checkRls({
    supabaseUrl: 'https://x.supabase.co/', anonKey: 'secret-anon', tables: ['areas'],
    fetch: (async (url: RequestInfo | URL, init?: RequestInit) => { calls.push({ url: String(url), init }); return new Response('[]'); }) as typeof fetch,
  });
  expect(calls[0].url).toBe('https://x.supabase.co/rest/v1/areas?select=*&limit=1');
  expect(calls[0].init?.headers).toEqual({ apikey: 'secret-anon' });
  expect(JSON.stringify(out)).not.toContain('secret-anon');
});

test.each([
  ['401 Invalid API key', '{"message":"Invalid API key"}', 401],
  ['404 PGRST205', '{"code":"PGRST205"}', 404],
  ['500', 'boom', 500],
  ['2xx object', '{}', 200],
  ['2xx không phải JSON', '<html>', 200],
])('trượt khi gặp %s', async (_n, body, status) => {
  const out = await run(() => new Response(body, { status }));
  expect(out.map((r) => r.ok)).toEqual([false, false]);
});

test('detail nêu mã HTTP và code', async () => {
  const out = await run(() => new Response('{"code":"PGRST205","message":"no table"}', { status: 404 }));
  expect(out[0].detail).toContain('404');
  expect(out[0].detail).toContain('PGRST205');
});

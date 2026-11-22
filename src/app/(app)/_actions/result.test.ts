import { beforeEach, expect, test, vi } from 'vitest';

const order: string[] = [];
const requireOwner = vi.fn(async () => {
  order.push('requireOwner');
});
const fakeDb = { fake: true };
const getDb = vi.fn(async () => fakeDb);
const revalidatePath = vi.fn();

vi.mock('@/server/auth', () => ({ requireOwner: () => requireOwner() }));
vi.mock('@/db/client', () => ({ getDb: () => getDb() }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }));

import { NotFoundError, ValidationError } from '@/server/errors';
import { runAction } from './result';

beforeEach(() => {
  order.length = 0;
  vi.clearAllMocks();
});

test('đường thành công: trả data và revalidate /context mặc định', async () => {
  const res = await runAction(async (db) => {
    expect(db).toBe(fakeDb);
    return 42;
  });
  expect(res).toEqual({ ok: true, data: 42 });
  expect(revalidatePath).toHaveBeenCalledWith('/context');
});

test('revalidate đúng các path được truyền', async () => {
  await runAction(async () => 1, ['/a', '/b']);
  expect(revalidatePath.mock.calls.map((c) => c[0])).toEqual(['/a', '/b']);
});

test('ValidationError và NotFoundError thành {ok:false, error}', async () => {
  expect(await runAction(async () => { throw new ValidationError('Sai rồi.'); })).toEqual({ ok: false, error: 'Sai rồi.' });
  expect(await runAction(async () => { throw new NotFoundError('Mất rồi.'); })).toEqual({ ok: false, error: 'Mất rồi.' });
  expect(revalidatePath).not.toHaveBeenCalled();
});

test('lỗi lạ: thông báo chung, log chỉ tên lỗi', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const err = new TypeError('secret input data');
  const res = await runAction(async () => { throw err; });
  expect(res).toEqual({ ok: false, error: 'Có lỗi xảy ra, thử lại.' });
  expect(JSON.stringify(spy.mock.calls)).not.toContain('secret input data');
  expect(JSON.stringify(spy.mock.calls)).toContain('TypeError');
  spy.mockRestore();
});

test('gọi requireOwner trước callback; lỗi redirect của requireOwner đi xuyên qua', async () => {
  await runAction(async () => {
    order.push('fn');
  });
  expect(order).toEqual(['requireOwner', 'fn']);

  const redirectErr = new Error('NEXT_REDIRECT');
  requireOwner.mockRejectedValueOnce(redirectErr);
  const fn = vi.fn();
  await expect(runAction(fn)).rejects.toBe(redirectErr);
  expect(fn).not.toHaveBeenCalled();
});

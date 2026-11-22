import { beforeEach, expect, test, vi } from 'vitest';

const renameConversation = vi.fn(async () => {});
const deleteConversation = vi.fn(async () => {});
vi.mock('@/server/auth', () => ({ requireOwner: async () => {} }));
vi.mock('@/db/client', () => ({ getDb: async () => ({}) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/server/services/conversations', () => ({
  renameConversation: (...a: unknown[]) => renameConversation(...(a as [])),
  deleteConversation: (...a: unknown[]) => deleteConversation(...(a as [])),
}));

import { deleteConversationAction, renameConversationAction } from './conversations';

const ID = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
beforeEach(() => vi.clearAllMocks());

test('id không phải uuid: báo lỗi, không gọi service', async () => {
  expect(await renameConversationAction('không-phải-uuid', 'Tên')).toEqual({ ok: false, error: 'Cuộc trò chuyện không hợp lệ.' });
  expect(await deleteConversationAction('x')).toEqual({ ok: false, error: 'Cuộc trò chuyện không hợp lệ.' });
  expect(renameConversation).not.toHaveBeenCalled();
  expect(deleteConversation).not.toHaveBeenCalled();
});

test('tiêu đề ngoài 1–200 ký tự: báo lỗi, không gọi service', async () => {
  for (const title of ['   ', 'x'.repeat(201)]) {
    expect(await renameConversationAction(ID, title)).toEqual({ ok: false, error: 'Tiêu đề phải dài 1–200 ký tự.' });
  }
  expect(renameConversation).not.toHaveBeenCalled();
});

test('hợp lệ: gọi service với dữ liệu đã chuẩn hóa', async () => {
  expect(await renameConversationAction(ID, '  Tên mới ')).toEqual({ ok: true, data: { id: ID } });
  expect(renameConversation).toHaveBeenCalledWith({}, ID, 'Tên mới');
  expect(await deleteConversationAction(ID)).toEqual({ ok: true, data: { id: ID } });
  expect(deleteConversation).toHaveBeenCalledWith({}, ID);
});

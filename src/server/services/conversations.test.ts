import { beforeEach, expect, test } from 'vitest';
import type { Db } from '@/db/client';
import { conversations, messages } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { NotFoundError, ValidationError } from '../errors';
import {
  appendMessage,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  listMessagesBefore,
  renameConversation,
  replaceReplies,
} from './conversations';

let db: Db;
beforeEach(async () => { db = await createTestDb(); });
const MISSING = '00000000-0000-4000-8000-000000000000';

test('list: updatedAt giảm dần và có giới hạn', async () => {
  const a = await createConversation(db, 'A');
  await createConversation(db, 'B');
  const c = await createConversation(db, 'C');
  await appendMessage(db, a.id, 'user', 'chạm A'); // A mới nhất
  expect((await listConversations(db)).map((x) => x.title)).toEqual(['A', 'C', 'B']);
  expect((await listConversations(db, 2)).map((x) => x.id)).toEqual([a.id, c.id]);
});

test('get: tin nhắn cũ nhất trước; id lạ trả null', async () => {
  const c = await createConversation(db, 'C');
  await appendMessage(db, c.id, 'user', 'một');
  await appendMessage(db, c.id, 'assistant', 'hai');
  const got = await getConversation(db, c.id);
  expect(got?.messages.map((m) => m.content)).toEqual(['một', 'hai']);
  expect(await getConversation(db, MISSING)).toBeNull();
});

test('rename: kiểm tra độ dài và NotFound', async () => {
  const c = await createConversation(db, 'C');
  await renameConversation(db, c.id, '  Mới  ');
  expect((await getConversation(db, c.id))?.conversation.title).toBe('Mới');
  await expect(renameConversation(db, c.id, '   ')).rejects.toBeInstanceOf(ValidationError);
  await expect(renameConversation(db, c.id, 'x'.repeat(201))).rejects.toBeInstanceOf(ValidationError);
  await expect(renameConversation(db, MISSING, 'ok')).rejects.toBeInstanceOf(NotFoundError);
});

test('rename không đẩy cuộc chat lên đầu Recent chats', async () => {
  const a = await createConversation(db, 'A');
  const b = await createConversation(db, 'B');
  await appendMessage(db, b.id, 'user', 'chạm B');
  await renameConversation(db, a.id, 'A mới');
  expect((await listConversations(db)).map((x) => x.id)).toEqual([b.id, a.id]);
});

test('listMessagesBefore: chỉ các tin trước tin đã cho', async () => {
  const c = await createConversation(db, 'C');
  await appendMessage(db, c.id, 'user', 'một');
  await appendMessage(db, c.id, 'assistant', 'hai');
  const three = await appendMessage(db, c.id, 'user', 'ba');
  await appendMessage(db, c.id, 'assistant', 'bốn');
  expect((await listMessagesBefore(db, c.id, three.id)).map((m) => m.content)).toEqual(['một', 'hai']);
});

test('replaceReplies: xóa các trả lời sau tin người dùng rồi lưu trả lời mới', async () => {
  const c = await createConversation(db, 'C');
  await appendMessage(db, c.id, 'user', 'một');
  await appendMessage(db, c.id, 'assistant', 'cũ 1');
  const u2 = await appendMessage(db, c.id, 'user', 'hai');
  await appendMessage(db, c.id, 'assistant', 'cũ 2');
  const saved = await replaceReplies(db, c.id, u2.id, 'mới', { x: 1 });
  expect((await getConversation(db, c.id))?.messages.map((m) => m.content)).toEqual(['một', 'cũ 1', 'hai', 'mới']);
  expect(saved).toMatchObject({ role: 'assistant', content: 'mới', metadata: { x: 1 } });
});

test('delete: xóa kèm tin nhắn; id lạ NotFound', async () => {
  const c = await createConversation(db, 'C');
  await appendMessage(db, c.id, 'user', 'x');
  await deleteConversation(db, c.id);
  expect(await db.select().from(conversations)).toEqual([]);
  expect(await db.select().from(messages)).toEqual([]);
  await expect(deleteConversation(db, MISSING)).rejects.toBeInstanceOf(NotFoundError);
});

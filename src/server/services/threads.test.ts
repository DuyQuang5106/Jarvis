import { beforeEach, expect, test } from 'vitest';
import type { Db } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { createArea } from './areas';
import { appendMessage, createConversation, getOrCreateThread, listArchivedConversations, listThreads } from './conversations';

let db: Db;
beforeEach(async () => { db = await createTestDb(); });
const manual = { origin: 'manual' as const };

test('danh sách ô chat: Chung đầu tiên, môn vừa dùng lên trước, kèm tin cuối; môn bị khóa AI không có ô', async () => {
  const alg = await createArea(db, { kind: 'academic', name: 'Algebra', status: 'active' }, manual);
  const db1 = await createArea(db, { kind: 'academic', name: 'Database', status: 'active' }, manual);
  await createArea(db, { kind: 'academic', name: 'Bí mật', status: 'active', aiExcluded: true }, manual);
  const general = await getOrCreateThread(db, { general: true });
  await appendMessage(db, general.id, 'user', 'chào');
  const dbThread = await getOrCreateThread(db, { areaId: db1.id });
  await appendMessage(db, dbThread.id, 'user', 'Database học gì');
  await appendMessage(db, dbThread.id, 'assistant', 'Chương 3');
  const list = await listThreads(db);
  expect(list.map((t) => [t.name, t.lastMessage])).toEqual([['Chung', 'chào'], ['Database', 'Chương 3'], ['Algebra', null]]);
  expect(list[2]).toMatchObject({ areaId: alg.id, conversationId: null });
  // Getting a thread again returns the same one.
  expect((await getOrCreateThread(db, { areaId: db1.id })).id).toBe(dbThread.id);
  const old = await createConversation(db, 'cũ');
  expect((await listArchivedConversations(db)).map((c) => c.id)).toEqual([old.id]);
});

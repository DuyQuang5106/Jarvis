import { expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import type { Db } from '@/db/client';
import { makeArea } from '@/db/test-helpers';
import { createTestDb } from '@/db/testing';
import { appendMessage, createConversation } from '../services/conversations';
import { getDocument } from '../queries/documents';
import { documentService } from '../services/documents';
import { folderService } from '../services/folders';
import { countRows, insertOrder, storageKeys, transferDatabase, type Queryable } from './transfer';

const manual = { origin: 'manual' } as const;
const asQueryable = (db: Db): Queryable => {
  const pg = (db as unknown as { $client: PGlite }).$client;
  return { query: async (sql, params) => (await pg.query(sql, params)).rows as never };
};

test('thứ tự chèn: bảng được trỏ tới đứng trước', async () => {
  const order = await insertOrder(asQueryable(await createTestDb()));
  for (const [child, parent] of [['documents', 'folders'], ['messages', 'conversations'], ['weekly_reviews', 'pending_actions'], ['tasks', 'milestones']]) {
    expect(order.indexOf(parent), `${parent} trước ${child}`).toBeLessThan(order.indexOf(child));
  }
});

test('chuyển toàn bộ dữ liệu sang database trống, giữ id, mảng, json, thư mục lồng nhau', async () => {
  const from = await createTestDb();
  const area = await makeArea(from, { name: 'Computer Networks' });
  const parent = await folderService.create(from, { areaId: area.id, name: 'Tài liệu' }, manual);
  const child = await folderService.create(from, { areaId: area.id, name: 'Đề thi', parentId: parent.id }, manual);
  const doc = await documentService.create(from, { areaId: area.id, folderId: child.id, title: '04_STATE.md', bodyMd: '# Trạng thái\n\nĐang học chương 4.', docRole: 'context' }, manual);
  await documentService.create(from, { areaId: area.id, title: 'Lab1.pdf', bodyMd: '', fileExt: 'pdf', docRole: 'raw', storageKey: `${area.id}/x.pdf`, extractedText: 'NAT' }, manual);
  const conv = await createConversation(from, 'Hỏi');
  await appendMessage(from, conv.id, 'assistant', 'Trả lời', { stats: { totalMs: 1 } });

  const to = await createTestDb();
  const counts = await transferDatabase(asQueryable(from), asQueryable(to));
  expect(counts).toEqual(await countRows(asQueryable(from)));
  expect(await getDocument(to, doc.id)).toMatchObject({ bodyMd: '# Trạng thái\n\nĐang học chương 4.', folderId: child.id });
  expect(await storageKeys(asQueryable(to))).toEqual([{ key: `${area.id}/x.pdf`, fileExt: 'pdf' }]);
  const [msg] = await asQueryable(to).query<{ metadata: unknown }>(`select metadata from messages where role = 'assistant'`);
  expect(msg.metadata).toEqual({ stats: { totalMs: 1 } });
});

test('database đích đã có dữ liệu: từ chối, không ghi gì', async () => {
  const from = await createTestDb();
  await makeArea(from, { name: 'A' });
  const to = await createTestDb();
  await makeArea(to, { name: 'B' });
  await expect(transferDatabase(asQueryable(from), asQueryable(to))).rejects.toThrow(/đã có dữ liệu/);
  expect((await countRows(asQueryable(to))).find((c) => c.table === 'areas')?.rows).toBe(1);
});

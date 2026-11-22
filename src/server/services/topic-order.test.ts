import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Db } from '@/db/client';
import { activityLogs, topics } from '@/db/schema';
import { makeArea } from '@/db/test-helpers';
import { createTestDb } from '@/db/testing';
import { NotFoundError } from '../errors';
import { topicService } from './entities';
import { moveTopic } from './topic-order';

let db: Db;
const manual = { origin: 'manual' as const };
beforeEach(async () => { db = await createTestDb(); });

async function seed(orders: number[]) {
  const area = await makeArea(db);
  const ids: string[] = [];
  for (const [i, sortOrder] of orders.entries()) {
    const t = await topicService.create(db, { areaId: area.id, title: `T${i}`, sortOrder }, manual);
    ids.push(t.id);
  }
  return { area, ids };
}

async function titles(areaId: string) {
  const rows = await db.select().from(topics).where(eq(topics.areaId, areaId));
  return rows.sort((a, b) => a.sortOrder - b.sortOrder).map((r) => `${r.title}:${r.sortOrder}`);
}

const moveLogs = async (since: number) => (await db.select().from(activityLogs)).slice(since);

test('move down và up đổi chỗ với hàng xóm', async () => {
  const { area, ids } = await seed([0, 1, 2]);
  await moveTopic(db, ids[0], 'down', manual);
  expect(await titles(area.id)).toEqual(['T1:0', 'T0:1', 'T2:2']);
  await moveTopic(db, ids[2], 'up', manual);
  expect(await titles(area.id)).toEqual(['T1:0', 'T2:1', 'T0:2']);
});

test('sortOrder trùng nhau được chuẩn hóa', async () => {
  const { area, ids } = await seed([0, 0, 0]);
  await moveTopic(db, ids[0], 'down', manual);
  const order = await titles(area.id);
  expect(order.map((s) => s.split(':')[1])).toEqual(['0', '1', '2']);
  expect(order[1].startsWith('T0')).toBe(true);
});

test('một lần move: log update cùng batchId, chỉ cho hàng đổi', async () => {
  const { ids } = await seed([0, 1, 2]);
  const before = (await db.select().from(activityLogs)).length;
  await moveTopic(db, ids[0], 'down', manual);
  const logs = await moveLogs(before);
  expect(logs).toHaveLength(2);
  expect(logs.every((l) => l.action === 'update')).toBe(true);
  expect(new Set(logs.map((l) => l.batchId)).size).toBe(1);
  expect(logs[0].batchId).not.toBeNull();
});

test('ở hai đầu là no-op không ghi log', async () => {
  const { area, ids } = await seed([0, 1]);
  const before = (await db.select().from(activityLogs)).length;
  await moveTopic(db, ids[0], 'up', manual);
  await moveTopic(db, ids[1], 'down', manual);
  expect(await titles(area.id)).toEqual(['T0:0', 'T1:1']);
  expect(await moveLogs(before)).toHaveLength(0);
});

test('id không tồn tại ném NotFoundError và không ghi gì', async () => {
  await seed([0, 1]);
  const before = (await db.select().from(activityLogs)).length;
  await expect(moveTopic(db, '00000000-0000-4000-8000-000000000000', 'up', manual)).rejects.toBeInstanceOf(NotFoundError);
  expect(await moveLogs(before)).toHaveLength(0);
});

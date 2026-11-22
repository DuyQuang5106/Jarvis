import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, expect, test } from 'vitest';
import { areas } from './schema';
import { createTestDb } from './testing';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
const clientOf = (db: TestDb) => (db as unknown as { $client: PGlite }).$client;

let shared: TestDb;
beforeAll(async () => {
  shared = await createTestDb();
});

let fromTest: TestDb | undefined;

test('DB tạo trong test được đóng khi test kết thúc', async () => {
  fromTest = await createTestDb();
  await fromTest.insert(areas).values({ kind: 'project', name: 'A' });
  expect(clientOf(fromTest).closed).toBe(false);
});

test('... và test sau thấy nó đã đóng', () => {
  expect(clientOf(fromTest!).closed).toBe(true);
});

test('DB tạo trong beforeAll còn dùng được qua nhiều test', async () => {
  await shared.insert(areas).values({ kind: 'project', name: 'B' });
  expect(await shared.select().from(areas)).toHaveLength(1);
});

test('... kể cả test tiếp theo', async () => {
  expect(clientOf(shared).closed).toBe(false);
  expect(await shared.select().from(areas)).toHaveLength(1);
});

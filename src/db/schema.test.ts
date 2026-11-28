import { eq, sql } from 'drizzle-orm';
import { expect, test } from 'vitest';
import { areas, documents, documentVersions, tasks, TABLE_NAMES } from './schema';
import { createTestDb, rowsOf } from './testing';

test('có đúng 25 bảng', async () => {
  const db = await createTestDb();
  const rows = await db.execute(sql`select tablename from pg_tables where schemaname = 'public' and tablename not like '__drizzle%' order by tablename`);
  expect(rowsOf(rows).map((r) => r.tablename)).toEqual([...TABLE_NAMES].sort());
  expect(TABLE_NAMES).toHaveLength(25);
});

test('mọi bảng đều bật RLS (criterion 13)', async () => {
  const db = await createTestDb();
  const rows = await db.execute(sql`
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname not like '__drizzle%' and not c.relrowsecurity`);
  expect(rowsOf(rows)).toEqual([]);
});

test('không có policy nào', async () => {
  const db = await createTestDb();
  const rows = await db.execute(sql`select policyname from pg_policies where schemaname = 'public'`);
  expect(rowsOf(rows)).toEqual([]);
});

test('cột date đi và về dưới dạng chuỗi YYYY-MM-DD', async () => {
  const db = await createTestDb();
  const [area] = await db.insert(areas).values({ kind: 'academic', name: 'Database' }).returning();
  const [task] = await db.insert(tasks).values({ areaId: area.id, title: 'Lab 1', dueDate: '2026-11-22' }).returning();
  expect(task.dueDate).toBe('2026-11-22');
});

test('giá trị mặc định của area', async () => {
  const db = await createTestDb();
  const [area] = await db.insert(areas).values({ kind: 'project', name: 'StewieSAT' }).returning();
  expect(area).toMatchObject({ status: 'unknown', priority: 'medium', aliases: [], aiExcluded: false, archivedAt: null });
});

test('mỗi createTestDb là một database riêng', async () => {
  const a = await createTestDb();
  const b = await createTestDb();
  await a.insert(areas).values({ kind: 'project', name: 'X' });
  expect(await b.select().from(areas)).toEqual([]);
});

test('tạo, sửa, xóa mềm documents và tìm theo search_tsv, tạo document_versions', async () => {
  const db = await createTestDb();
  const [area] = await db.insert(areas).values({ kind: 'academic', name: 'Tư tưởng HCM' }).returning();
  const [doc] = await db
    .insert(documents)
    .values({ areaId: area.id, title: 'Đề cương', bodyMd: '# Nội dung', searchText: 'de cuong noi dung' })
    .returning();
  expect(doc.revision).toBe(1);
  expect(doc.deletedAt).toBeNull();

  const [v1] = await db
    .insert(documentVersions)
    .values({ documentId: doc.id, revision: doc.revision, title: doc.title, bodyMd: doc.bodyMd, origin: 'manual' })
    .returning();
  expect(v1.revision).toBe(1);

  const hits = await db
    .select({ id: documents.id })
    .from(documents)
    .where(sql`${documents.searchTsv} @@ plainto_tsquery('simple', 'de cuong')`);
  expect(hits.map((h) => h.id)).toEqual([doc.id]);

  const now = new Date();
  const [softDeleted] = await db
    .update(documents)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(documents.id, doc.id))
    .returning();
  expect(softDeleted.deletedAt).not.toBeNull();
});

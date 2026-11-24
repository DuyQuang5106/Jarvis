import { asc, desc, eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Db } from '@/db/client';
import { activityLogs, areas, documentVersions, documents } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { createArea } from './areas';
import { documentService, MAX_VERSIONS_PER_DOC } from './documents';

const manual = { origin: 'manual' as const };
const aiMeta = { origin: 'ai_approved' as const, batchId: '11111111-1111-4111-8111-111111111111' };
let db: Db;
let areaId: string;

beforeEach(async () => {
  db = await createTestDb();
  areaId = (await createArea(db, { kind: 'academic', name: 'Tư tưởng Hồ Chí Minh' }, manual)).id;
});

test('tạo tài liệu ghi log, version đầu, searchText bỏ dấu và chạm area.updatedAt', async () => {
  const t1 = new Date('2026-11-23T01:00:00Z');
  const doc = await documentService.create(db, { areaId, title: 'Đề cương', bodyMd: '# Tư tưởng' }, manual, { now: t1 });
  expect(doc.revision).toBe(1);
  expect(doc.searchText).toBe('de cuong tu tuong');

  const logs = await db.select().from(activityLogs).where(eq(activityLogs.entityId, doc.id));
  expect(logs).toHaveLength(1);
  expect(logs[0].action).toBe('create');
  const versions = await db.select().from(documentVersions).where(eq(documentVersions.documentId, doc.id));
  expect(versions).toHaveLength(1);
  expect(versions[0]).toMatchObject({ revision: 1, title: 'Đề cương', origin: 'manual' });
  const [area] = await db.select().from(areas).where(eq(areas.id, areaId));
  expect(area.updatedAt.toISOString()).toBe(t1.toISOString());
});

test('updateBody kiểm tra xung đột expectedRevision và tăng revision', async () => {
  const doc = await documentService.create(db, { areaId, title: 'Ghi chú', bodyMd: 'v1' }, manual);
  const updated = await documentService.updateBody(db, doc.id, 'v2', 1, manual);
  expect(updated.revision).toBe(2);
  expect(updated.bodyMd).toBe('v2');

  await expect(documentService.updateBody(db, doc.id, 'v-stale', 1, manual)).rejects.toBeInstanceOf(ConflictError);
  const [fresh] = await db.select().from(documents).where(eq(documents.id, doc.id));
  expect(fresh.bodyMd).toBe('v2');
  expect(fresh.revision).toBe(2);
});

test('gộp log và chính sách version theo phiên sửa 5 phút và đổi tài liệu', async () => {
  const t0 = new Date('2026-11-23T01:00:00Z');
  const t1 = new Date('2026-11-23T01:01:00Z');
  const t2 = new Date('2026-11-23T01:02:00Z');
  const t3 = new Date('2026-11-23T01:08:00Z'); // >= 5 phút không sửa -> phiên mới

  const d1 = await documentService.create(db, { areaId, title: 'Doc 1', bodyMd: 'a' }, manual, { now: t0 });
  const d2 = await documentService.create(db, { areaId, title: 'Doc 2', bodyMd: 'x' }, manual, { now: t0 });

  await documentService.updateBody(db, d1.id, 'ab', 1, manual, { now: t1 });
  await documentService.updateBody(db, d1.id, 'abc', 2, manual, { now: t2 });
  let d1Logs = await db
    .select()
    .from(activityLogs)
    .where(eq(activityLogs.entityId, d1.id))
    .orderBy(asc(activityLogs.createdAt));
  expect(d1Logs.map((l) => l.action)).toEqual(['create', 'update']);
  expect((d1Logs[1].afterJson as { bodyMd: string }).bodyMd).toBe('abc');
  let d1Versions = await db.select().from(documentVersions).where(eq(documentVersions.documentId, d1.id));
  expect(d1Versions).toHaveLength(2); // initial (rev 1) + session start (rev 2)

  // Sau >= 5 phút -> mở phiên mới: thêm 1 log update và 1 version mới
  await documentService.updateBody(db, d1.id, 'abcd', 3, manual, { now: t3 });
  d1Logs = await db
    .select()
    .from(activityLogs)
    .where(eq(activityLogs.entityId, d1.id))
    .orderBy(asc(activityLogs.createdAt));
  expect(d1Logs.map((l) => l.action)).toEqual(['create', 'update', 'update']);
  d1Versions = await db.select().from(documentVersions).where(eq(documentVersions.documentId, d1.id));
  expect(d1Versions).toHaveLength(3);

  // Đổi sang Doc 2 rồi quay lại Doc 1 trong < 5 phút -> tính phiên mới
  const t4 = new Date('2026-11-23T01:09:00Z');
  const t5 = new Date('2026-11-23T01:10:00Z');
  await documentService.updateBody(db, d2.id, 'xy', 1, manual, { now: t4 });
  await documentService.updateBody(db, d1.id, 'abcde', 4, manual, { now: t5 });
  d1Logs = await db
    .select()
    .from(activityLogs)
    .where(eq(activityLogs.entityId, d1.id))
    .orderBy(asc(activityLogs.createdAt));
  expect(d1Logs.map((l) => l.action)).toEqual(['create', 'update', 'update', 'update']);

  // AI áp dụng luôn tạo version và log riêng
  await documentService.updateBody(db, d1.id, 'abcdef', 5, aiMeta, { now: new Date('2026-11-23T01:11:00Z') });
  d1Versions = await db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, d1.id))
    .orderBy(desc(documentVersions.revision));
  expect(d1Versions[0]).toMatchObject({ origin: 'ai_approved', batchId: aiMeta.batchId, revision: 6 });
});

test('giới hạn tối đa version cho mỗi tài liệu', async () => {
  const doc = await documentService.create(db, { areaId, title: 'Cap', bodyMd: '0' }, manual, {
    now: new Date('2026-11-23T00:00:00Z'),
  });
  let rev = 1;
  for (let i = 1; i <= MAX_VERSIONS_PER_DOC + 5; i += 1) {
    const t = new Date(Date.UTC(2026, 10, 23, 0, i * 10, 0));
    const next = await documentService.updateBody(db, doc.id, `v${i}`, rev, manual, { now: t });
    rev = next.revision;
  }
  const versions = await db.select().from(documentVersions).where(eq(documentVersions.documentId, doc.id));
  expect(versions).toHaveLength(MAX_VERSIONS_PER_DOC);
});

test('xóa mềm, khôi phục tài liệu, khôi phục version và đổi thứ tự', async () => {
  const d1 = await documentService.create(db, { areaId, title: 'A', bodyMd: 'v1' }, manual);
  const d2 = await documentService.create(db, { areaId, title: 'B', bodyMd: 'b1' }, manual);

  await documentService.reorder(db, areaId, [d2.id, d1.id], manual);
  const ordered = await db.select().from(documents).where(eq(documents.areaId, areaId)).orderBy(asc(documents.sortOrder));
  expect(ordered.map((d) => d.id)).toEqual([d2.id, d1.id]);

  await documentService.softDelete(db, d1.id, manual);
  await expect(documentService.updateBody(db, d1.id, 'x', 1, manual)).rejects.toBeInstanceOf(NotFoundError);
  const restored = await documentService.restore(db, d1.id, manual);
  expect(restored.deletedAt).toBeNull();

  await documentService.updateBody(db, d1.id, 'v2', 1, aiMeta);
  const [v1] = await db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, d1.id))
    .orderBy(asc(documentVersions.revision));
  const reverted = await documentService.restoreVersion(db, d1.id, v1.id, { origin: 'undo' });
  expect(reverted.bodyMd).toBe('v1');
  expect(reverted.revision).toBe(3);
  const allVersions = await db.select().from(documentVersions).where(eq(documentVersions.documentId, d1.id));
  expect(allVersions).toHaveLength(3);
});

test('rollback khi lỗi giữa chừng và từ chối nội dung quá 200.000 ký tự', async () => {
  const doc = await documentService.create(db, { areaId, title: 'Rollback', bodyMd: 'init' }, manual);
  await expect(documentService.updateBody(db, doc.id, 'x'.repeat(200_001), 1, manual)).rejects.toBeInstanceOf(
    ValidationError,
  );
  await expect(
    db.transaction(async (tx) => {
      await documentService.rename(tx, doc.id, 'Changed', manual);
      throw new Error('boom');
    }),
  ).rejects.toThrow('boom');
  const [after] = await db.select().from(documents).where(eq(documents.id, doc.id));
  expect(after.title).toBe('Rollback');
});

import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Db } from '@/db/client';
import { academicDetails, projectDetails } from '@/db/schema';
import { logsFor } from '@/db/test-helpers';
import { createTestDb } from '@/db/testing';
import { ValidationError } from '../errors';
import { addProgressLog, archiveArea, createArea, unarchiveArea, updateArea } from './areas';

let db: Db;
const manual = { origin: 'manual' as const };
beforeEach(async () => { db = await createTestDb(); });

test('createArea academic tạo details với target_grade mặc định A', async () => {
  const area = await createArea(db, { kind: 'academic', name: 'Mobile Programming', aliases: ['Mobile'], academic: { term: 'HK1 2026-2027' } }, manual);
  const [details] = await db.select().from(academicDetails).where(eq(academicDetails.areaId, area.id));
  expect(details).toMatchObject({ term: 'HK1 2026-2027', targetGrade: 'A', credits: null });
  expect(area).toMatchObject({ status: 'unknown', aliases: ['Mobile'] });
  const logs = await logsFor(db, area.id);
  expect(logs).toHaveLength(1);
  expect(logs[0].afterJson).toMatchObject({ name: 'Mobile Programming', details: { term: 'HK1 2026-2027' } });
});

test('createArea project tạo project_details', async () => {
  const area = await createArea(db, { kind: 'project', name: 'Question House', project: { role: 'Android dev' } }, manual);
  expect(await db.select().from(projectDetails).where(eq(projectDetails.areaId, area.id))).toHaveLength(1);
});

test('updateArea sửa cả area lẫn details trong một log', async () => {
  const area = await createArea(db, { kind: 'academic', name: 'Database' }, manual);
  await updateArea(db, area.id, { status: 'active', nextAction: 'Xem syllabus', academic: { examFormat: 'Tự luận' } }, manual);
  const logs = await logsFor(db, area.id);
  expect(logs).toHaveLength(2);
  expect(logs[1].beforeJson).toMatchObject({ status: 'unknown', details: { examFormat: null } });
  expect(logs[1].afterJson).toMatchObject({ status: 'active', details: { examFormat: 'Tự luận' } });
});

test('updateArea không đổi gì thì không ghi log', async () => {
  const area = await createArea(db, { kind: 'academic', name: 'Database' }, manual);
  await updateArea(db, area.id, { name: 'Database', status: 'unknown' }, manual);
  expect(await logsFor(db, area.id)).toHaveLength(1);
});

test('updateArea chỉ đổi details vẫn ghi log và cập nhật updatedAt', async () => {
  const area = await createArea(db, { kind: 'academic', name: 'Database' }, manual);
  const updated = await updateArea(db, area.id, { academic: { credits: 3 } }, manual);
  expect(await logsFor(db, area.id)).toHaveLength(2);
  expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(area.updatedAt.getTime());
  const same = await updateArea(db, area.id, { academic: { credits: 3 } }, manual);
  expect(same.updatedAt).toEqual(updated.updatedAt);
  expect(await logsFor(db, area.id)).toHaveLength(2);
});

test('trường sai loại và alias không hợp lệ bị từ chối', async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await expect(createArea(db, { kind: 'project', name: 'X', academic: { term: 'a' } } as any, manual)).rejects.toBeInstanceOf(ValidationError);
  await expect(createArea(db, { kind: 'academic', name: 'C Programming', aliases: ['C'] }, manual)).rejects.toBeInstanceOf(ValidationError);
  await expect(createArea(db, { kind: 'academic', name: 'X', aliases: ['Mobile', 'mobile'] }, manual)).rejects.toBeInstanceOf(ValidationError);
});

test('updateArea từ chối details sai loại và alias trùng', async () => {
  const area = await createArea(db, { kind: 'project', name: 'X' }, manual);
  await expect(updateArea(db, area.id, { academic: { term: 'a' } }, manual)).rejects.toBeInstanceOf(ValidationError);
  await expect(updateArea(db, area.id, { aliases: ['ab', 'AB'] }, manual)).rejects.toBeInstanceOf(ValidationError);
});

test('archiveArea đặt archived_at và ghi log archive; lặp lại là no-op', async () => {
  const area = await createArea(db, { kind: 'project', name: 'StewieSAT' }, manual);
  await archiveArea(db, area.id, manual);
  await archiveArea(db, area.id, manual);
  const logs = await logsFor(db, area.id);
  expect(logs).toHaveLength(2);
  expect(logs[1]).toMatchObject({ action: 'archive' });
  expect((logs[1].afterJson as { archivedAt: unknown }).archivedAt).not.toBeNull();
  await unarchiveArea(db, area.id, manual);
  await unarchiveArea(db, area.id, manual);
  const after = await logsFor(db, area.id);
  expect(after).toHaveLength(3);
  expect(after[2]).toMatchObject({ action: 'archive', afterJson: { archivedAt: null } });
});

test('addProgressLog ghi log progress', async () => {
  const area = await createArea(db, { kind: 'academic', name: 'Mobile Programming' }, manual);
  await addProgressLog(db, area.id, '22/11: đã đọc xong phần Navigation', manual);
  expect((await logsFor(db, area.id))[1]).toMatchObject({ entityType: 'area', action: 'progress', afterJson: { text: '22/11: đã đọc xong phần Navigation' } });
  await expect(addProgressLog(db, area.id, '', manual)).rejects.toBeInstanceOf(ValidationError);
});

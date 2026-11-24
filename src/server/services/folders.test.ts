import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Db } from '@/db/client';
import { activityLogs, documents, folders } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { NotFoundError, ValidationError } from '../errors';
import { getExcludedFolderIds, listFolders } from '../queries/folders';
import { createArea } from './areas';
import { documentService } from './documents';
import { folderService } from './folders';

const manual = { origin: 'manual' as const };
let db: Db;
let areaId: string;

beforeEach(async () => {
  db = await createTestDb();
  areaId = (await createArea(db, { kind: 'academic', name: 'Computer Networks' }, manual)).id;
});

test('tạo, đổi tên, di chuyển thư mục và chặn vòng lặp cây', async () => {
  const root = await folderService.create(db, { areaId, name: '01_Context' }, manual);
  const child = await folderService.create(db, { areaId, parentId: root.id, name: 'Sub' }, manual);
  const grandchild = await folderService.create(db, { areaId, parentId: child.id, name: 'Leaf' }, manual);

  await expect(folderService.move(db, root.id, root.id, manual)).rejects.toBeInstanceOf(ValidationError);
  await expect(folderService.move(db, root.id, grandchild.id, manual)).rejects.toBeInstanceOf(ValidationError);

  const renamed = await folderService.rename(db, child.id, 'Renamed', manual);
  expect(renamed.name).toBe('Renamed');

  const movedOut = await folderService.move(db, grandchild.id, null, manual);
  expect(movedOut.parentId).toBeNull();

  const otherArea = await createArea(db, { kind: 'academic', name: 'Database' }, manual);
  const otherFolder = await folderService.create(db, { areaId: otherArea.id, name: 'Other' }, manual);
  await expect(folderService.move(db, child.id, otherFolder.id, manual)).rejects.toBeInstanceOf(ValidationError);
});

test('xóa mềm thư mục kéo theo thư mục con và tài liệu bên trong trong cùng transaction', async () => {
  const parent = await folderService.create(db, { areaId, name: '02_Tai_lieu' }, manual);
  const child = await folderService.create(db, { areaId, parentId: parent.id, name: 'Slides' }, manual);
  const doc = await documentService.create(db, { areaId, folderId: child.id, title: 'Ch1.pdf', fileExt: 'pdf', mimeType: 'application/pdf' }, manual);

  await folderService.softDelete(db, parent.id, manual);
  expect(await listFolders(db, areaId)).toEqual([]);

  const [dRow] = await db.select().from(documents).where(eq(documents.id, doc.id));
  expect(dRow.deletedAt).not.toBeNull();

  const [fRow] = await db.select().from(folders).where(eq(folders.id, child.id));
  expect(fRow.deletedAt).not.toBeNull();

  const logs = await db.select().from(activityLogs).where(eq(activityLogs.entityId, parent.id));
  expect(logs.map((l) => l.action)).toEqual(['create', 'delete']);
});

test('kế thừa ai_excluded từ thư mục ông/cha xuống các thư mục con và khôi phục an toàn', async () => {
  const gp = await folderService.create(db, { areaId, name: 'Private Root', aiExcluded: true }, manual);
  const parent = await folderService.create(db, { areaId, parentId: gp.id, name: 'Nested' }, manual);
  const leaf = await folderService.create(db, { areaId, parentId: parent.id, name: 'Deep' }, manual);
  const publicFolder = await folderService.create(db, { areaId, name: 'Public' }, manual);

  const excluded = await getExcludedFolderIds(db, areaId);
  expect(excluded.has(gp.id)).toBe(true);
  expect(excluded.has(parent.id)).toBe(true);
  expect(excluded.has(leaf.id)).toBe(true);
  expect(excluded.has(publicFolder.id)).toBe(false);

  await folderService.softDelete(db, parent.id, manual);
  await folderService.softDelete(db, gp.id, manual);
  // Restoring `parent` when `gp` is deleted lifts `parent` cleanly to root instead of pointing to a deleted folder.
  const restored = await folderService.restore(db, parent.id, manual);
  expect(restored.deletedAt).toBeNull();
  expect(restored.parentId).toBeNull();

  await expect(folderService.rename(db, '00000000-0000-4000-8000-000000000000', 'X', manual)).rejects.toBeInstanceOf(NotFoundError);
});

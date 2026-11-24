import { beforeEach, expect, test, vi } from 'vitest';
import type { Db } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { createArea } from '@/server/services/areas';

let db: Db;

beforeEach(async () => {
  db = await createTestDb();
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/server/auth', () => ({ requireOwner: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/db/client', async (orig) => {
  const actual = await orig<typeof import('@/db/client')>();
  return { ...actual, getDb: async () => db };
});

const { createDocumentAction, moveDocumentAction, setDocumentRoleAction, updateDocumentBodyAction, softDeleteDocumentAction } = await import('./documents');
const { createFolderAction, moveFolderAction, softDeleteFolderAction } = await import('./folders');

test('actions tạo, lưu và xóa mềm qua runAction, kiểm tra quá độ dài bằng tiếng Việt', async () => {
  const area = await createArea(db, { kind: 'academic', name: 'Database' }, { origin: 'manual' });

  const created = await createDocumentAction({ areaId: area.id, title: 'Syllabus', bodyMd: '# Init' });
  expect(created.ok).toBe(true);
  if (!created.ok) return;

  const tooLong = await updateDocumentBodyAction(created.data.id, 'a'.repeat(200_001), 1);
  expect(tooLong).toEqual({ ok: false, error: 'Nội dung tài liệu tối đa 200.000 ký tự.' });

  const saved = await updateDocumentBodyAction(created.data.id, '# Updated', 1);
  expect(saved).toMatchObject({ ok: true, data: { revision: 2 } });

  const conflict = await updateDocumentBodyAction(created.data.id, '# Stale', 1);
  expect(conflict).toEqual({ ok: false, error: 'Tài liệu đã thay đổi ở nơi khác.' });

  const del = await softDeleteDocumentAction(created.data.id);
  expect(del.ok).toBe(true);
});

test('folder actions tạo, di chuyển, chặn vòng lặp và đổi vai trò tài liệu qua runAction', async () => {
  const area = await createArea(db, { kind: 'academic', name: 'Algebra' }, { origin: 'manual' });

  const f1 = await createFolderAction({ areaId: area.id, name: '01_Context' });
  const f2 = await createFolderAction({ areaId: area.id, parentId: f1.ok ? f1.data.id : null, name: 'Child' });
  expect(f1.ok && f2.ok).toBe(true);
  if (!f1.ok || !f2.ok) return;

  const cycle = await moveFolderAction(f1.data.id, f2.data.id);
  expect(cycle.ok).toBe(false);

  const doc = await createDocumentAction({ areaId: area.id, title: 'Notes.md', bodyMd: '# Algebra' });
  expect(doc.ok).toBe(true);
  if (!doc.ok) return;

  const moved = await moveDocumentAction(doc.data.id, f2.data.id);
  expect(moved).toMatchObject({ ok: true, data: { folderId: f2.data.id } });

  const roleChanged = await setDocumentRoleAction(doc.data.id, 'raw');
  expect(roleChanged).toMatchObject({ ok: true, data: { docRole: 'raw' } });

  const delFolder = await softDeleteFolderAction(f1.data.id);
  expect(delFolder.ok).toBe(true);
});

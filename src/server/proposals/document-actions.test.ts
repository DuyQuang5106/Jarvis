import { expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeArea, logsFor } from '@/db/test-helpers';
import { createTestDb } from '@/db/testing';
import { tasks } from '@/db/schema';
import { getDocument, listDocumentVersions } from '../queries/documents';
import { documentService } from '../services/documents';
import { folderService } from '../services/folders';
import { editDocument } from './document-actions';
import { loadProposal } from './load';
import { approvePendingAction, rejectPendingAction } from './resolve';
import { createPendingAction } from './store';
import { undoPendingAction } from './undo';

const manual = { origin: 'manual' } as const;
const original = '# Tiến độ\n\nChưa đọc.\n\n# Ghi chú\n\nBản gốc.\n';

async function fixture() {
  const db = await createTestDb();
  const area = await makeArea(db, { name: 'Algebra' });
  const doc = await documentService.create(db, { areaId: area.id, title: 'Tổng quan', bodyMd: original }, manual);
  const replace = { type: 'replace_section' as const, documentId: doc.id, heading: 'Tiến độ', markdown: 'Đã đọc.' };
  return { db, area, doc, replace };
}

test('duyệt đồng thời chỉ áp dụng một lần, gộp thay đổi tài liệu, có batch và hoàn tác được', async () => {
  const { db, area, doc, replace } = await fixture();
  const pending = await createPendingAction(db, { source: 'chat', proposal: { summary: 'Cập nhật', actions: [
    replace, { type: 'rename_document', documentId: doc.id, title: 'Tiến độ Algebra' },
    { type: 'create_task', areaId: area.id, title: 'Đọc lại' },
  ] } });
  expect(pending).not.toBeNull();
  expect((await loadProposal(db, pending!.id))?.previews[0]).toMatchObject({
    documentId: doc.id, diff: { before: expect.stringContaining('Chưa đọc.'), after: 'Đã đọc.' },
  });
  const [a, b] = await Promise.all([0, 1].map(() => approvePendingAction(db, pending!.id, { selectedKeys: [0, 1, 2] })));
  expect([a.status, b.status].sort()).toEqual(['already_resolved', 'applied']);
  expect(await getDocument(db, doc.id)).toMatchObject({
    revision: doc.revision + 1, title: 'Tiến độ Algebra', bodyMd: expect.stringContaining('Đã đọc.'),
  });
  expect((await listDocumentVersions(db, doc.id)).filter((version) => version.origin === 'ai_approved')).toHaveLength(1);
  expect((await logsFor(db, doc.id)).filter((log) => log.origin === 'ai_approved')).toHaveLength(1);
  expect(await db.select().from(tasks).where(eq(tasks.areaId, area.id))).toHaveLength(1);
  expect(await undoPendingAction(db, pending!.id)).toEqual({ status: 'undone' });
  expect(await getDocument(db, doc.id)).toMatchObject({ bodyMd: original, title: doc.title, revision: doc.revision + 2 });
  expect((await logsFor(db, doc.id)).map((log) => log.origin)).toEqual(['manual', 'ai_approved', 'undo']);
  expect(await db.select().from(tasks).where(eq(tasks.areaId, area.id))).toHaveLength(0);
  expect(await undoPendingAction(db, pending!.id)).toEqual({ status: 'unavailable' });
});

test('sửa phần khác vẫn duyệt được, sửa đích thì không ghi cả lô, hoàn tác giữ bản mới', async () => {
  const { db, area, doc, replace } = await fixture();
  const make = () => createPendingAction(db, { source: 'chat', proposal: { summary: 'Cập nhật', actions: [
    replace, { type: 'create_task', areaId: area.id, title: 'Cần đọc' },
  ] } });
  const conflicting = await make();
  await documentService.updateBody(db, doc.id, original.replace('Chưa đọc.', 'Bản mới đích.'), doc.revision, manual);
  expect(await approvePendingAction(db, conflicting!.id, { selectedKeys: [0, 1] }))
    .toEqual({ status: 'conflict', conflicts: [{ key: 0, kind: 'changed' }] });
  expect(await db.select().from(tasks)).toHaveLength(0);
  const stillValid = await make();
  await documentService.updateBody(db, doc.id, original.replace('Chưa đọc.', 'Bản mới đích.').replace('Bản gốc.', 'Bản mới ngoài đích.'), doc.revision + 1, manual);
  expect(await approvePendingAction(db, stillValid!.id, { selectedKeys: [0] })).toMatchObject({ status: 'partially_applied' });
  const updated = (await getDocument(db, doc.id))!;
  expect(updated.bodyMd).toContain('Bản mới ngoài đích.');
  await documentService.updateBody(db, doc.id, updated.bodyMd + '\nSửa thêm sau khi duyệt.', updated.revision, manual);
  expect(await undoPendingAction(db, stillValid!.id)).toEqual({
    status: 'conflict', documents: [{ areaId: area.id, documentId: doc.id }],
  });
  expect((await getDocument(db, doc.id))?.bodyMd).toContain('Sửa thêm sau khi duyệt.');
});

test('đích riêng tư, hướng dẫn, tệp nhị phân, phần trùng tên và deadline ghi riêng vào Markdown đều bị chặn', async () => {
  const { db, area, doc, replace } = await fixture();
  const propose = (documentId: string, requestText?: string) => createPendingAction(db, {
    source: 'chat', requestText, proposal: { summary: 'Sửa tài liệu', actions: [{ ...replace, documentId }] },
  });
  const root = await folderService.create(db, { areaId: area.id, name: 'Riêng tư', aiExcluded: true }, manual);
  const folder = await folderService.create(db, { areaId: area.id, name: 'Con', parentId: root.id }, manual);
  const docs = await Promise.all([
    documentService.create(db, { areaId: area.id, title: 'Riêng tư qua thư mục', bodyMd: original, folderId: folder.id }, manual),
    documentService.create(db, { areaId: area.id, title: 'Hai mục', bodyMd: original + '\n# Tiến độ\nKhác.' }, manual),
    documentService.create(db, { areaId: area.id, title: 'PDF', bodyMd: original, fileExt: 'pdf', storageKey: area.id + '/raw.pdf' }, manual),
  ]);
  for (const target of docs) expect(await propose(target.id)).toBeNull();
  expect(await propose(doc.id, 'Hạn nộp là ngày mai')).toBeNull();
  const pending = (await propose(doc.id))!;
  await documentService.setRole(db, doc.id, 'instruction', manual);
  expect(await propose(doc.id)).toBeNull();
  expect(await approvePendingAction(db, pending.id, { selectedKeys: [0] })).toMatchObject({ status: 'conflict' });
  const preview = (await loadProposal(db, pending.id))?.previews[0];
  expect(preview).toMatchObject({ conflict: 'missing' });
  expect(preview?.diff).toBeUndefined();
});

test('sửa nội dung được nhưng đổi neo bị từ chối, từ chối đề xuất giữ nguyên tài liệu', async () => {
  const { db, doc, replace } = await fixture();
  const make = () => createPendingAction(db, { source: 'chat', proposal: { summary: 'Cập nhật', actions: [replace] } });
  const pending = (await make())!;
  expect(await approvePendingAction(db, pending.id, { selectedKeys: [0], edits: { 0: { ...replace, heading: 'Ghi chú' } } }))
    .toMatchObject({ status: 'invalid' });
  expect(await rejectPendingAction(db, pending.id)).toEqual({ status: 'rejected' });
  expect((await getDocument(db, doc.id))?.bodyMd).toBe(original);
  const edited = (await make())!;
  expect(await approvePendingAction(db, edited.id, { selectedKeys: [0], edits: { 0: { ...replace, markdown: 'Tôi đã đọc.' } } }))
    .toMatchObject({ status: 'applied' });
  expect((await getDocument(db, doc.id))?.bodyMd).toContain('Tôi đã đọc.');
});

test('mục Markdown dùng Setext giữ nguyên dấu xuống dòng và đích kế tiếp', () => {
  const bodyMd = 'Tiến độ\r\n=======\r\nChưa đọc.\r\n\r\nGhi chú\r\n======\r\nGiữ nguyên.';
  const result = editDocument({ title: 'Tài liệu', bodyMd }, {
    type: 'replace_section', documentId: 'id', heading: 'Tiến độ', markdown: 'Đã đọc.',
  });
  expect(result?.body).toBe('Tiến độ\r\n=======\r\nĐã đọc.\r\n\r\nGhi chú\r\n======\r\nGiữ nguyên.');
});

test('neo checklist loại bỏ đoạn mã, giữ nguyên nội dung ngoài neo', () => {
  const markdown = '```md\n- [ ] Đọc bài\n```\n\n- [ ] Đọc bài\n';
  const result = editDocument({ title: 'Tài liệu', bodyMd: markdown }, {
    type: 'set_checklist_item', documentId: 'id', itemText: 'Đọc bài', checked: true,
  });
  expect(result?.body).toBe('```md\n- [ ] Đọc bài\n```\n\n- [x] Đọc bài\n');
});

import { beforeEach, expect, test } from 'vitest';
import type { Db } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { createArea } from '../services/areas';
import { documentService } from '../services/documents';
import { folderService } from '../services/folders';
import { getDocument, listDocuments, listDocumentVersions, searchDocuments } from './documents';

const manual = { origin: 'manual' as const };
let db: Db;
let areaId: string;

beforeEach(async () => {
  db = await createTestDb();
  areaId = (await createArea(db, { kind: 'project', name: 'Jarvis' }, manual)).id;
});

test('listDocuments bỏ qua tài liệu đã xóa mềm và sắp theo sortOrder', async () => {
  const d1 = await documentService.create(db, { areaId, title: 'Doc 1', bodyMd: '1' }, manual);
  const d2 = await documentService.create(db, { areaId, title: 'Doc 2', bodyMd: '2' }, manual);
  await documentService.reorder(db, areaId, [d2.id, d1.id], manual);
  await documentService.softDelete(db, d1.id, manual);

  const list = await listDocuments(db, areaId);
  expect(list.map((d) => d.id)).toEqual([d2.id]);
  expect(await getDocument(db, d1.id)).toBeNull();
  expect((await getDocument(db, d2.id))?.title).toBe('Doc 2');
  expect(await getDocument(db, 'not-a-uuid')).toBeNull();
  expect(await listDocumentVersions(db, d2.id)).toHaveLength(1);
});

test('searchDocuments tìm không dấu ("tu tuong" khớp "tư tưởng") và bỏ qua tài liệu đã xóa mềm', async () => {
  const other = await createArea(db, { kind: 'academic', name: 'Môn Triết' }, manual);
  const d1 = await documentService.create(
    db,
    { areaId: other.id, title: 'Đề cương môn', bodyMd: 'Nội dung về tư tưởng Hồ Chí Minh trong kháng chiến.' },
    manual,
  );
  const dDeleted = await documentService.create(
    db,
    { areaId, title: 'Tư tưởng cũ', bodyMd: 'Bản nháp' },
    manual,
  );
  await documentService.softDelete(db, dDeleted.id, manual);

  const hits = await searchDocuments(db, { query: 'tu tuong' });
  expect(hits.map((h) => h.id)).toEqual([d1.id]);
  expect(hits[0].areaName).toBe('Môn Triết');
  expect(hits[0].snippet).toContain('tư tưởng Hồ Chí Minh');

  expect(await searchDocuments(db, { query: 'tu tuong', areaId })).toEqual([]);
});

test('searchDocuments tìm được extractedText từ PDF/PPTX và ẩn tài liệu nằm trong thư mục ai_excluded khi excludeAiPrivate=true', async () => {
  const pubFolder = await folderService.create(db, { areaId, name: '02_Tai_lieu' }, manual);
  const privRoot = await folderService.create(db, { areaId, name: 'Private', aiExcluded: true }, manual);
  const privNested = await folderService.create(db, { areaId, parentId: privRoot.id, name: 'Sub' }, manual);

  const pdfDoc = await documentService.create(
    db,
    {
      areaId,
      folderId: pubFolder.id,
      title: 'Chapter_2.pdf',
      docRole: 'raw',
      mimeType: 'application/pdf',
      fileExt: 'pdf',
      storageKey: `${areaId}/ch2.pdf`,
      sizeBytes: 1200,
      extractedText: 'Tầng vật lý truyền tín hiệu số qua cáp xoắn đôi.',
    },
    manual,
  );

  const secretDoc = await documentService.create(
    db,
    {
      areaId,
      folderId: privNested.id,
      title: 'Ghi chú cá nhân',
      bodyMd: 'Tầng vật lý bí mật riêng tư',
    },
    manual,
  );

  const allHits = await searchDocuments(db, { query: 'tang vat ly' });
  expect(allHits.map((h) => h.id)).toContain(pdfDoc.id);
  expect(allHits.map((h) => h.id)).toContain(secretDoc.id);
  expect(allHits.find((h) => h.id === pdfDoc.id)?.snippet).toContain('Tầng vật lý');

  const aiHits = await searchDocuments(db, { query: 'tang vat ly', excludeAiPrivate: true });
  expect(aiHits.map((h) => h.id)).toEqual([pdfDoc.id]);
});

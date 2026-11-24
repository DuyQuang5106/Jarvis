import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { createTestDb } from '@/db/testing';
import { listDocuments } from '@/server/queries/documents';
import { listFolders } from '@/server/queries/folders';
import { createArea } from '@/server/services/areas';
import { createMemoryStorage } from '@/server/storage/memory';
import { importHustMaterials } from './import-hust-materials';

let tmp: string | null = null;
afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = null;
});

test('importHustMaterials chuẩn hóa cây 4 thư mục, bỏ qua .lnk, và chạy lại idempotent', async () => {
  tmp = mkdtempSync(join(tmpdir(), 'jarvis-hust-import-'));
  const contextRoot = join(tmp, 'context');
  const rawRoot = join(tmp, 'raw');
  const cSub = join(contextRoot, 'DBPack');
  const rSub = join(rawRoot, 'DBRaw', 'HR_Database');
  const rMid = join(rawRoot, 'DBRaw', 'OneDrive_1_10-7-2026');
  mkdirSync(cSub, { recursive: true });
  mkdirSync(rSub, { recursive: true });
  mkdirSync(rMid, { recursive: true });

  writeFileSync(join(cSub, 'VALIDATION_REPORT.md'), '# Validation', 'utf8');
  writeFileSync(join(cSub, 'CONTEXT.md'), '# Context DB', 'utf8');
  writeFileSync(join(cSub, 'EXAM_ANALYSIS.md'), '# Exam analysis', 'utf8');
  writeFileSync(join(cSub, 'QUESTION_INDEX.csv'), 'id,q\n1,SQL', 'utf8');
  writeFileSync(join(rSub, '1_Create Table.txt'), 'CREATE TABLE emp(id int);', 'utf8');
  writeFileSync(join(rMid, 'Database - giữa kì thầy Phương.txt'), 'Câu 1 SQL', 'utf8');
  writeFileSync(join(rawRoot, 'DBRaw', 'Perplexity.lnk'), 'binary-lnk', 'utf8');

  const db = await createTestDb();
  const storage = createMemoryStorage();
  const area = await createArea(db, { kind: 'academic', name: 'Database' }, { origin: 'manual' });
  const mappings = [{ areaName: 'Database', contextSubpath: 'DBPack', rawSubpath: 'DBRaw' }];

  const dry = await importHustMaterials(db, storage, { contextRoot, rawRoot, mappings, dryRun: true });
  expect(dry.errors).toEqual([]);
  expect(dry.docsCreated).toBe(6);
  expect(dry.skippedUnsupported).toHaveLength(1);
  expect(await listDocuments(db, area.id)).toEqual([]);

  const first = await importHustMaterials(db, storage, { contextRoot, rawRoot, mappings, dryRun: false });
  expect(first.docsCreated).toBe(6);
  expect(first.errors).toEqual([]);
  expect(first.skippedUnsupported).toHaveLength(1);

  const fRows = await listFolders(db, area.id);
  const fNames = fRows.map((f) => f.name);
  expect(fNames).toEqual(expect.arrayContaining(['00_Kiểm_kê', '01_Context', '02_Tài_liệu_học', 'HR_Database', '03_Đề_thi_&_Ôn_tập']));

  const docs = await listDocuments(db, area.id);
  expect(docs).toHaveLength(6);
  expect(docs.find((d) => d.title === '08_VALIDATION.md')?.docRole).toBe('context');
  expect(docs.find((d) => d.title === '03_EXAM_ANALYSIS.md')?.docRole).toBe('raw');
  expect(docs.find((d) => d.title === 'QUESTION_INDEX.csv')?.docRole).toBe('raw');
  expect(docs.find((d) => d.title === '1_Create Table.txt')?.folderId).toBe(fRows.find((f) => f.name === 'HR_Database')?.id);

  // Re-run is completely idempotent: 0 new docs created.
  const second = await importHustMaterials(db, storage, { contextRoot, rawRoot, mappings, dryRun: false });
  expect(second.docsCreated).toBe(0);
  expect(second.docsSkipped).toBe(6);
});

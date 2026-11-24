import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Db } from '@/db/client';
import { activityLogs, documents, noteDocumentMap, notes } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { createArea } from '../services/areas';
import { noteService } from '../services/entities';
import { migrateToDocuments } from './migrate-to-documents';

const manual = { origin: 'manual' as const };
let db: Db;

beforeEach(async () => {
  db = await createTestDb();
});

test('dry-run không ghi DB, báo cáo đúng ký tự; apply idempotent và bảo toàn ai_excluded & inbox', async () => {
  const course = await createArea(
    db,
    {
      kind: 'academic',
      name: 'Mobile Programming',
      summary: 'Môn lập trình di động',
      goal: 'Đạt A',
      aiExcluded: true,
      academic: {
        term: '2026-1',
        credits: 3,
        targetGrade: 'A',
        gradingScheme: 'Lab 30% | Thi 70%',
        examFormat: '# Trắc nghiệm + code',
        courseOutline: '- Navigation\n- State',
      },
    },
    manual,
  );
  const proj = await createArea(
    db,
    {
      kind: 'project',
      name: 'Question House',
      summary: 'App Android',
      project: { role: 'Lead', collaborators: '2 bạn', scope: 'MVP', cadence: '3 buổi/tuần' },
    },
    manual,
  );

  const areaNote = await noteService.create(db, { areaId: proj.id, text: 'Dòng đầu tiên\nChi tiết bên dưới', aiExcluded: true }, manual);
  const inboxNote = await noteService.create(db, { areaId: null, text: 'Inbox giữ nguyên' }, manual);

  const dry = await migrateToDocuments(db, { dryRun: true });
  expect(dry.dryRun).toBe(true);
  expect(dry.documentsCreated).toBe(3); // 2 overview docs + 1 area note
  expect(dry.notesMigrated).toBe(1);
  expect(dry.fieldCharsBefore).toBe(dry.fieldCharsAfter);
  expect(dry.noteCharsBefore).toBe(dry.noteCharsAfter);
  expect(await db.select().from(documents)).toHaveLength(0);

  const applied = await migrateToDocuments(db, { dryRun: false });
  expect(applied.documentsCreated).toBe(3);
  expect(applied.notesMigrated).toBe(1);
  expect(applied.fieldCharsBefore).toBe(applied.fieldCharsAfter);
  expect(applied.noteCharsBefore).toBe(applied.noteCharsAfter);

  const allDocs = await db.select().from(documents);
  expect(allDocs).toHaveLength(3);

  const courseOverview = allDocs.find((d) => d.areaId === course.id)!;
  expect(courseOverview.title).toBe('Tổng quan (đã chuyển)');
  expect(courseOverview.aiExcluded).toBe(true);
  expect(courseOverview.bodyMd).toContain('Lab 30% | Thi 70%');
  expect(courseOverview.bodyMd).toContain('# Trắc nghiệm + code');

  const noteDoc = allDocs.find((d) => d.areaId === proj.id && d.title === 'Dòng đầu tiên')!;
  expect(noteDoc.aiExcluded).toBe(true);
  expect(noteDoc.bodyMd).toBe(areaNote.text);

  const maps = await db.select().from(noteDocumentMap);
  expect(maps).toEqual([expect.objectContaining({ noteId: areaNote.id, documentId: noteDoc.id })]);

  // Inbox note stays untouched in notes
  const [stillInbox] = await db.select().from(notes).where(eq(notes.id, inboxNote.id));
  expect(stillInbox.areaId).toBeNull();

  // Origin migration logged
  const migLogs = (await db.select().from(activityLogs)).filter((l) => l.origin === 'migration');
  expect(migLogs).toHaveLength(3);

  // Idempotent second run creates 0 new docs
  const second = await migrateToDocuments(db, { dryRun: false });
  expect(second.documentsCreated).toBe(0);
  expect(second.notesMigrated).toBe(0);
  expect(second.areasSkipped).toBe(2);
  expect(await db.select().from(documents)).toHaveLength(3);
});

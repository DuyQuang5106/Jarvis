import { and, asc, eq, isNotNull } from 'drizzle-orm';
import type { Db } from '@/db/client';
import {
  academicDetails,
  areas,
  documents,
  noteDocumentMap,
  notes,
  projectDetails,
} from '@/db/schema';
import { documentService } from '../services/documents';

export const MIGRATED_OVERVIEW_KEY = 'migrated_overview';

export type MigrationReport = {
  dryRun: boolean;
  areasTotal: number;
  areasProcessed: number;
  areasSkipped: number;
  documentsCreated: number;
  notesMigrated: number;
  fieldCharsBefore: number;
  fieldCharsAfter: number;
  noteCharsBefore: number;
  noteCharsAfter: number;
  errors: { areaId: string; areaName: string; message: string }[];
};

type FieldSection = { heading: string; raw: string };

const NEEDS_FENCE_RE = /^(?:#{1,6}\s|>|[-*+]\s|\d+\.\s|```|~~~)|\|/m;

function formatSection(heading: string, raw: string): { markdown: string; fenced: boolean } {
  const fenced = NEEDS_FENCE_RE.test(raw);
  const body = fenced ? `\`\`\`text\n${raw}\n\`\`\`` : raw;
  return { markdown: `## ${heading}\n\n${body}`, fenced };
}

function extractSectionChars(markdownBlocks: { markdown: string; fenced: boolean }[]): number {
  let total = 0;
  for (const { markdown, fenced } of markdownBlocks) {
    const firstBreak = markdown.indexOf('\n\n');
    let content = firstBreak >= 0 ? markdown.slice(firstBreak + 2) : markdown;
    if (fenced && content.startsWith('```text\n') && content.endsWith('\n```')) {
      content = content.slice('```text\n'.length, -'\n```'.length);
    }
    total += content.length;
  }
  return total;
}

function noteTitleFrom(text: string): string {
  const firstLine = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return 'Ghi chú';
  return firstLine.slice(0, 80);
}

export async function migrateToDocuments(
  db: Db,
  opts: { dryRun: boolean } = { dryRun: true },
): Promise<MigrationReport> {
  const allAreas = await db.select().from(areas).orderBy(asc(areas.createdAt), asc(areas.id));
  const report: MigrationReport = {
    dryRun: opts.dryRun,
    areasTotal: allAreas.length,
    areasProcessed: 0,
    areasSkipped: 0,
    documentsCreated: 0,
    notesMigrated: 0,
    fieldCharsBefore: 0,
    fieldCharsAfter: 0,
    noteCharsBefore: 0,
    noteCharsAfter: 0,
    errors: [],
  };

  const migrationMeta = { origin: 'migration' as const };

  for (const area of allAreas) {
    try {
      await db.transaction(async (tx) => {
        const [existingOverview] = await tx
          .select({ id: documents.id })
          .from(documents)
          .where(and(eq(documents.areaId, area.id), eq(documents.templateKey, MIGRATED_OVERVIEW_KEY)));

        const sections: FieldSection[] = [];
        if (area.summary && area.summary.length > 0) sections.push({ heading: 'Tóm tắt', raw: area.summary });
        if (area.goal && area.goal.length > 0) sections.push({ heading: 'Mục tiêu', raw: area.goal });

        if (area.kind === 'academic') {
          const [ac] = await tx.select().from(academicDetails).where(eq(academicDetails.areaId, area.id));
          if (ac) {
            if (ac.term) sections.push({ heading: 'Học kỳ', raw: ac.term });
            if (ac.credits !== null && ac.credits !== undefined) {
              sections.push({ heading: 'Số tín chỉ', raw: String(ac.credits) });
            }
            if (ac.targetGrade) sections.push({ heading: 'Mục tiêu điểm', raw: ac.targetGrade });
            if (ac.gradingScheme) sections.push({ heading: 'Hình thức đánh giá', raw: ac.gradingScheme });
            if (ac.examFormat) sections.push({ heading: 'Hình thức thi', raw: ac.examFormat });
            if (ac.courseOutline) sections.push({ heading: 'Đề cương môn học', raw: ac.courseOutline });
          }
        } else {
          const [pr] = await tx.select().from(projectDetails).where(eq(projectDetails.areaId, area.id));
          if (pr) {
            if (pr.role) sections.push({ heading: 'Vai trò', raw: pr.role });
            if (pr.collaborators) sections.push({ heading: 'Đối tác/nhóm', raw: pr.collaborators });
            if (pr.scope) sections.push({ heading: 'Phạm vi', raw: pr.scope });
            if (pr.cadence) sections.push({ heading: 'Nhịp độ mong muốn', raw: pr.cadence });
          }
        }

        const areaNotes = await tx
          .select()
          .from(notes)
          .where(and(eq(notes.areaId, area.id), isNotNull(notes.areaId)))
          .orderBy(asc(notes.createdAt), asc(notes.id));

        const existingMapRows = await tx.select().from(noteDocumentMap);
        const mappedNoteIds = new Set(existingMapRows.map((m) => m.noteId));
        const unmigratedNotes = areaNotes.filter((n) => !mappedNoteIds.has(n.id));

        const needsOverview = !existingOverview && sections.length > 0;
        if (!needsOverview && unmigratedNotes.length === 0) {
          report.areasSkipped += 1;
          return;
        }

        report.areasProcessed += 1;

        if (needsOverview) {
          const formatted = sections.map((s) => formatSection(s.heading, s.raw));
          const bodyMd = formatted.map((f) => f.markdown).join('\n\n');
          report.fieldCharsBefore += sections.reduce((sum, s) => sum + s.raw.length, 0);
          report.fieldCharsAfter += extractSectionChars(formatted);
          report.documentsCreated += 1;

          if (!opts.dryRun) {
            await documentService.create(
              tx,
              {
                areaId: area.id,
                title: 'Tổng quan (đã chuyển)',
                bodyMd,
                templateKey: MIGRATED_OVERVIEW_KEY,
                aiExcluded: area.aiExcluded,
              },
              migrationMeta,
              { touchArea: false },
            );
          }
        }

        for (const n of unmigratedNotes) {
          report.noteCharsBefore += n.text.length;
          report.noteCharsAfter += n.text.length;
          report.documentsCreated += 1;
          report.notesMigrated += 1;

          if (!opts.dryRun) {
            const doc = await documentService.create(
              tx,
              {
                areaId: area.id,
                title: noteTitleFrom(n.text),
                bodyMd: n.text,
                aiExcluded: n.aiExcluded,
              },
              migrationMeta,
              { createdAt: n.createdAt, touchArea: false },
            );
            await tx.insert(noteDocumentMap).values({ noteId: n.id, documentId: doc.id });
          }
        }
      });
    } catch (err) {
      report.errors.push({
        areaId: area.id,
        areaName: area.name,
        message: err instanceof Error ? err.message : 'Lỗi không xác định',
      });
    }
  }

  return report;
}

import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import type { AreaKind } from '@/db/enums';
import {
  academicDetails,
  activityLogs,
  areas,
  assessments,
  blockers,
  milestones,
  notes,
  projectDetails,
  tasks,
  topics,
  type AcademicDetailsRow,
  type ActivityLogRow,
  type AreaRow,
  type AssessmentRow,
  type BlockerRow,
  type MilestoneRow,
  type NoteRow,
  type ProjectDetailsRow,
  type TaskRow,
  type TopicRow,
} from '@/db/schema';

export type AreaDetails = {
  area: AreaRow;
  academic: AcademicDetailsRow | null;
  project: ProjectDetailsRow | null;
  topics: TopicRow[];
  assessments: AssessmentRow[];
  milestones: MilestoneRow[];
  blockers: BlockerRow[];
  tasks: TaskRow[];
  notes: NoteRow[];
  logs: ActivityLogRow[];
};

export async function getAreaDetails(
  db: DbOrTx,
  areaId: string,
  opts: { logLimit?: number } = {},
): Promise<AreaDetails | null> {
  const [area] = await db.select().from(areas).where(eq(areas.id, areaId));
  if (!area) return null;
  const logLimit = opts.logLimit ?? 50;
  const [academicRows, projectRows, topicRows, assessmentRows, milestoneRows, blockerRows, taskRows, noteRows, logRows] =
    await Promise.all([
      db.select().from(academicDetails).where(eq(academicDetails.areaId, areaId)),
      db.select().from(projectDetails).where(eq(projectDetails.areaId, areaId)),
      db.select().from(topics).where(eq(topics.areaId, areaId)).orderBy(asc(topics.sortOrder), asc(topics.createdAt)),
      db.select().from(assessments).where(eq(assessments.areaId, areaId)).orderBy(asc(assessments.dueDate), asc(assessments.createdAt)),
      db.select().from(milestones).where(eq(milestones.areaId, areaId)).orderBy(asc(milestones.targetDate), asc(milestones.createdAt)),
      db.select().from(blockers).where(eq(blockers.areaId, areaId)).orderBy(desc(blockers.createdAt)),
      db.select().from(tasks).where(eq(tasks.areaId, areaId)).orderBy(asc(tasks.sortOrder), asc(tasks.createdAt)),
      db.select().from(notes).where(eq(notes.areaId, areaId)).orderBy(desc(notes.createdAt), desc(notes.id)),
      db
        .select()
        .from(activityLogs)
        .where(eq(activityLogs.areaId, areaId))
        .orderBy(desc(activityLogs.createdAt), desc(activityLogs.id))
        .limit(logLimit),
    ]);
  return {
    area,
    academic: academicRows[0] ?? null,
    project: projectRows[0] ?? null,
    topics: topicRows,
    assessments: assessmentRows,
    milestones: milestoneRows,
    blockers: blockerRows,
    tasks: taskRows,
    notes: noteRows,
    logs: logRows,
  };
}

export async function listArchivedAreas(db: DbOrTx, kind: AreaKind): Promise<AreaRow[]> {
  return db
    .select()
    .from(areas)
    .where(and(eq(areas.kind, kind), isNotNull(areas.archivedAt)))
    .orderBy(desc(areas.archivedAt));
}

export async function listInboxNotes(db: DbOrTx): Promise<NoteRow[]> {
  return db.select().from(notes).where(eq(notes.inboxStatus, 'inbox')).orderBy(desc(notes.createdAt), desc(notes.id));
}

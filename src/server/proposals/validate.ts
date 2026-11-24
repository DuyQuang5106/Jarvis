import { and, eq } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import { areas, assessments, blockers, milestones, tasks, topics, type AreaRow } from '@/db/schema';
import { isDocumentAction, stampDocumentAction, type DocumentAction } from './document-actions';
import type { ProposedAction, StoredAction } from './schema';

export type StampError = { index: number; message: string };
export type StampResult = { ok: true; stored: StoredAction[] } | { ok: false; errors: StampError[] };

const ARCHIVED_MSG = 'Mục đã lưu trữ.';

async function loadArea(db: DbOrTx, id: string): Promise<AreaRow | null> {
  const [row] = await db.select().from(areas).where(and(eq(areas.id, id), eq(areas.aiExcluded, false)));
  return row ?? null;
}

async function validateOne(
  db: DbOrTx,
  action: Exclude<ProposedAction, DocumentAction>,
): Promise<{ ok: true; baseUpdatedAt: string | null } | { ok: false; message: string }> {
  switch (action.type) {
    case 'create_note': {
      if (!action.areaId) return { ok: true, baseUpdatedAt: null };
      const area = await loadArea(db, action.areaId);
      if (!area) return { ok: false, message: 'Không tìm thấy mục.' };
      if (area.archivedAt) return { ok: false, message: ARCHIVED_MSG };
      return { ok: true, baseUpdatedAt: null };
    }
    case 'add_progress_log': {
      const area = await loadArea(db, action.areaId);
      if (!area) return { ok: false, message: 'Không tìm thấy mục.' };
      if (area.archivedAt) return { ok: false, message: ARCHIVED_MSG };
      return { ok: true, baseUpdatedAt: null };
    }
    case 'create_task': {
      const area = await loadArea(db, action.areaId);
      if (!area) return { ok: false, message: 'Không tìm thấy mục.' };
      if (area.archivedAt) return { ok: false, message: ARCHIVED_MSG };
      if (action.milestoneId) {
        const [ms] = await db.select().from(milestones).where(eq(milestones.id, action.milestoneId));
        if (!ms || ms.areaId !== action.areaId) return { ok: false, message: 'Milestone không thuộc mục này.' };
      }
      return { ok: true, baseUpdatedAt: null };
    }
    case 'update_area': {
      const area = await loadArea(db, action.id);
      if (!area) return { ok: false, message: 'Không tìm thấy mục.' };
      if (area.archivedAt) return { ok: false, message: ARCHIVED_MSG };
      return { ok: true, baseUpdatedAt: area.updatedAt.toISOString() };
    }
    case 'update_task': {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, action.id));
      if (!task) return { ok: false, message: 'Không tìm thấy task.' };
      const area = await loadArea(db, task.areaId);
      if (!area || area.archivedAt) return { ok: false, message: ARCHIVED_MSG };
      return { ok: true, baseUpdatedAt: task.updatedAt.toISOString() };
    }
    case 'upsert_topic': {
      const area = await loadArea(db, action.areaId);
      if (!area) return { ok: false, message: 'Không tìm thấy mục.' };
      if (area.archivedAt) return { ok: false, message: ARCHIVED_MSG };
      if (area.kind !== 'academic') return { ok: false, message: 'Topic chỉ dành cho Academic.' };
      if (!action.id) return { ok: true, baseUpdatedAt: null };
      const [topic] = await db.select().from(topics).where(eq(topics.id, action.id));
      if (!topic || topic.areaId !== action.areaId) return { ok: false, message: 'Không tìm thấy topic thuộc mục này.' };
      return { ok: true, baseUpdatedAt: topic.updatedAt.toISOString() };
    }
    case 'upsert_assessment': {
      const area = await loadArea(db, action.areaId);
      if (!area) return { ok: false, message: 'Không tìm thấy mục.' };
      if (area.archivedAt) return { ok: false, message: ARCHIVED_MSG };
      if (area.kind !== 'academic') return { ok: false, message: 'Assessment chỉ dành cho Academic.' };
      if (!action.id) return { ok: true, baseUpdatedAt: null };
      const [assessment] = await db.select().from(assessments).where(eq(assessments.id, action.id));
      if (!assessment || assessment.areaId !== action.areaId) {
        return { ok: false, message: 'Không tìm thấy assessment thuộc mục này.' };
      }
      return { ok: true, baseUpdatedAt: assessment.updatedAt.toISOString() };
    }
    case 'upsert_milestone': {
      const area = await loadArea(db, action.areaId);
      if (!area) return { ok: false, message: 'Không tìm thấy mục.' };
      if (area.archivedAt) return { ok: false, message: ARCHIVED_MSG };
      if (area.kind !== 'project') return { ok: false, message: 'Milestone chỉ dành cho Projects.' };
      if (!action.id) return { ok: true, baseUpdatedAt: null };
      const [ms] = await db.select().from(milestones).where(eq(milestones.id, action.id));
      if (!ms || ms.areaId !== action.areaId) return { ok: false, message: 'Không tìm thấy milestone thuộc mục này.' };
      return { ok: true, baseUpdatedAt: ms.updatedAt.toISOString() };
    }
    case 'create_blocker': {
      const area = await loadArea(db, action.areaId);
      if (!area) return { ok: false, message: 'Không tìm thấy mục.' };
      if (area.archivedAt) return { ok: false, message: ARCHIVED_MSG };
      if (area.kind !== 'project') return { ok: false, message: 'Blocker chỉ dành cho Projects.' };
      return { ok: true, baseUpdatedAt: null };
    }
    case 'resolve_blocker': {
      const [blocker] = await db.select().from(blockers).where(eq(blockers.id, action.id));
      if (!blocker) return { ok: false, message: 'Không tìm thấy blocker.' };
      if (blocker.status === 'resolved') return { ok: false, message: 'Blocker đã được gỡ.' };
      const area = await loadArea(db, blocker.areaId);
      if (!area || area.archivedAt) return { ok: false, message: ARCHIVED_MSG };
      return { ok: true, baseUpdatedAt: blocker.updatedAt.toISOString() };
    }
  }
}

export async function stampActions(db: DbOrTx, actions: ProposedAction[]): Promise<StampResult> {
  const stored: StoredAction[] = [];
  const errors: StampError[] = [];
  for (let i = 0; i < actions.length; i += 1) {
    const action = actions[i];
    if (isDocumentAction(action)) {
      const stamp = await stampDocumentAction(db, action);
      if (!stamp) errors.push({ index: i, message: 'Tài liệu không thể sửa hoặc mục đích không khớp duy nhất.' });
      else stored.push({ key: i, action, ...stamp });
      continue;
    }
    const res = await validateOne(db, action);
    if (!res.ok) errors.push({ index: i, message: res.message });
    else stored.push({ key: i, action: actions[i], baseUpdatedAt: res.baseUpdatedAt });
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, stored };
}

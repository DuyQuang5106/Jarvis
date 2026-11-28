import { and, eq } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import { areas, assessments, blockers, milestones, tasks, topics, type AreaRow } from '@/db/schema';
import { formatDateTimeVi } from '@/lib/dates';
import { FIELD_LABEL, formatFieldValue } from '../queries/describe-log';
import { mergeAliases } from './aliases';
import { describeDocumentAction, isDocumentAction } from './document-actions';
import type { ActionPreview, ProposedAction, StoredAction } from './schema';

type Change = ActionPreview['changes'][number];

function sameValue(a: unknown, b: unknown): boolean {
  return (a ?? null) === (b ?? null);
}

async function loadArea(db: DbOrTx, areaId: string | null): Promise<AreaRow | null> {
  if (!areaId) return null;
  const [row] = await db.select().from(areas).where(and(eq(areas.id, areaId), eq(areas.aiExcluded, false)));
  return row ?? null;
}

async function milestoneTitle(db: DbOrTx, milestoneId: unknown): Promise<string | null> {
  if (typeof milestoneId !== 'string') return null;
  const [ms] = await db.select({ title: milestones.title }).from(milestones).where(eq(milestones.id, milestoneId));
  return ms?.title ?? null;
}

async function formatValue(db: DbOrTx, field: string, value: unknown): Promise<string | null> {
  if (field === 'milestoneId') return milestoneTitle(db, value);
  return formatFieldValue(field, value);
}

async function diffFields(
  db: DbOrTx,
  fields: readonly string[],
  current: Record<string, unknown> | null,
  next: Record<string, unknown>,
  isCreate: boolean,
): Promise<Change[]> {
  const out: Change[] = [];
  for (const field of fields) {
    const val = next[field];
    if (val === undefined) continue;
    if (isCreate) {
      if (val === null) continue;
      out.push({ field: FIELD_LABEL[field] ?? field, before: null, after: await formatValue(db, field, val) });
      continue;
    }
    const prev = current ? current[field] : null;
    if (sameValue(prev, val)) continue;
    out.push({
      field: FIELD_LABEL[field] ?? field,
      before: await formatValue(db, field, prev),
      after: await formatValue(db, field, val),
    });
  }
  return out;
}

function conflictFor(
  row: { updatedAt: Date } | null,
  area: AreaRow | null,
  baseUpdatedAt: string | null,
  isCreate: boolean,
  needsArea: boolean,
): ActionPreview['conflict'] {
  if (needsArea && (!area || area.archivedAt !== null)) return 'missing';
  if (isCreate) return 'none';
  if (!row) return 'missing';
  if (baseUpdatedAt !== null && row.updatedAt.toISOString() !== baseUpdatedAt) return 'changed';
  return 'none';
}

function quote(name: string | null | undefined): string {
  return name ? ` “${name}”` : '';
}

async function describeOne(db: DbOrTx, item: StoredAction): Promise<ActionPreview> {
  const a: ProposedAction = item.action;
  if (isDocumentAction(a)) return describeDocumentAction(db, item, a);
  switch (a.type) {
    case 'create_task': {
      const area = await loadArea(db, a.areaId);
      const changes = await diffFields(
        db,
        ['title', 'status', 'dueDate', 'deadlineType', 'estimateMinutes', 'milestoneId', 'progressDone', 'progressTotal'],
        null,
        a,
        true,
      );
      return {
        key: item.key,
        type: a.type,
        areaId: a.areaId,
        areaName: area?.name ?? null,
        label: `Tạo task${quote(a.title)}`,
        changes,
        isCreate: true,
        conflict: conflictFor(null, area, item.baseUpdatedAt, true, true),
      };
    }
    case 'update_task': {
      const [row] = await db.select().from(tasks).where(eq(tasks.id, a.id));
      const area = await loadArea(db, row?.areaId ?? null);
      const changes = await diffFields(
        db,
        ['title', 'status', 'dueDate', 'deadlineType', 'estimateMinutes', 'blockedReason', 'progressDone', 'progressTotal'],
        row ?? null,
        a.patch,
        false,
      );
      return {
        key: item.key,
        type: a.type,
        areaId: area?.id ?? null,
        areaName: area?.name ?? null,
        label: `Sửa task${quote(row?.title)}`,
        changes,
        isCreate: false,
        conflict: conflictFor(row ?? null, area, item.baseUpdatedAt, false, true),
      };
    }
    case 'update_area': {
      const area = await loadArea(db, a.id);
      const changes = await diffFields(
        db,
        ['status', 'priority', 'nextAction', 'summary', 'goal', 'startDate', 'deadlineDate'],
        area ?? null,
        a.patch,
        false,
      );
      if (a.patch.addAliases && area) {
        const after = mergeAliases(area.aliases, a.patch.addAliases, area.name);
        if (after.length > area.aliases.length) {
          changes.push({ field: FIELD_LABEL.aliases, before: formatFieldValue('aliases', area.aliases), after: formatFieldValue('aliases', after) });
        }
      }
      return {
        key: item.key,
        type: a.type,
        areaId: area?.id ?? a.id,
        areaName: area?.name ?? null,
        label: `Sửa mục${quote(area?.name)}`,
        changes,
        isCreate: false,
        conflict: conflictFor(area, area, item.baseUpdatedAt, false, true),
      };
    }
    case 'upsert_topic': {
      const area = await loadArea(db, a.areaId);
      const isCreate = !a.id;
      const [row] = a.id ? await db.select().from(topics).where(eq(topics.id, a.id)) : [undefined];
      const changes = await diffFields(db, ['title', 'status', 'evidence'], row ?? null, a, isCreate);
      return {
        key: item.key,
        type: a.type,
        areaId: a.areaId,
        areaName: area?.name ?? null,
        label: `${isCreate ? 'Tạo' : 'Sửa'} topic${quote(row?.title ?? a.title)}`,
        changes,
        isCreate,
        conflict: conflictFor(row ?? null, area, item.baseUpdatedAt, isCreate, true),
      };
    }
    case 'upsert_milestone': {
      const area = await loadArea(db, a.areaId);
      const isCreate = !a.id;
      const [row] = a.id ? await db.select().from(milestones).where(eq(milestones.id, a.id)) : [undefined];
      const changes = await diffFields(db, ['title', 'status', 'targetDate', 'acceptanceCriteria'], row ?? null, a, isCreate);
      return {
        key: item.key,
        type: a.type,
        areaId: a.areaId,
        areaName: area?.name ?? null,
        label: `${isCreate ? 'Tạo' : 'Sửa'} milestone${quote(row?.title ?? a.title)}`,
        changes,
        isCreate,
        conflict: conflictFor(row ?? null, area, item.baseUpdatedAt, isCreate, true),
      };
    }
    case 'upsert_assessment': {
      const area = await loadArea(db, a.areaId);
      const isCreate = !a.id;
      const [row] = a.id ? await db.select().from(assessments).where(eq(assessments.id, a.id)) : [undefined];
      const changes = await diffFields(db, ['title', 'dueDate', 'weight', 'score', 'maxScore'], row ?? null, a, isCreate);
      return {
        key: item.key,
        type: a.type,
        areaId: a.areaId,
        areaName: area?.name ?? null,
        label: `${isCreate ? 'Tạo' : 'Sửa'} assessment${quote(row?.title ?? a.title)}`,
        changes,
        isCreate,
        conflict: conflictFor(row ?? null, area, item.baseUpdatedAt, isCreate, true),
      };
    }
    case 'create_note': {
      const area = await loadArea(db, a.areaId ?? null);
      return {
        key: item.key,
        type: a.type,
        areaId: a.areaId ?? null,
        areaName: area?.name ?? null,
        label: 'Thêm ghi chú',
        changes: [{ field: FIELD_LABEL.text, before: null, after: a.text }],
        isCreate: true,
        conflict: conflictFor(null, area, item.baseUpdatedAt, true, Boolean(a.areaId)),
      };
    }
    case 'create_reminder': {
      const area = a.areaId ? await loadArea(db, a.areaId) : null;
      return {
        key: item.key,
        type: a.type,
        areaId: a.areaId ?? null,
        areaName: area?.name ?? null,
        label: 'Nhắc việc',
        changes: [
          { field: 'Nội dung', before: null, after: a.text },
          { field: 'Lúc', before: null, after: formatDateTimeVi(a.remindAt) },
        ],
        isCreate: true,
        conflict: conflictFor(null, area, item.baseUpdatedAt, true, Boolean(a.areaId)),
      };
    }
    case 'add_progress_log': {
      const area = await loadArea(db, a.areaId);
      return {
        key: item.key,
        type: a.type,
        areaId: a.areaId,
        areaName: area?.name ?? null,
        label: 'Thêm log tiến độ',
        changes: [{ field: FIELD_LABEL.text, before: null, after: a.text }],
        isCreate: true,
        conflict: conflictFor(null, area, item.baseUpdatedAt, true, true),
      };
    }
    case 'create_blocker': {
      const area = await loadArea(db, a.areaId);
      const changes = await diffFields(
        db,
        ['title', 'lastAttempt', 'nextAction', 'externalDependency'],
        null,
        a,
        true,
      );
      return {
        key: item.key,
        type: a.type,
        areaId: a.areaId,
        areaName: area?.name ?? null,
        label: `Tạo blocker${quote(a.title)}`,
        changes,
        isCreate: true,
        conflict: conflictFor(null, area, item.baseUpdatedAt, true, true),
      };
    }
    case 'resolve_blocker': {
      const [row] = await db.select().from(blockers).where(eq(blockers.id, a.id));
      const area = await loadArea(db, row?.areaId ?? null);
      const changes = await diffFields(db, ['status'], row ?? null, { status: 'resolved' }, false);
      return {
        key: item.key,
        type: a.type,
        areaId: area?.id ?? null,
        areaName: area?.name ?? null,
        label: `Gỡ blocker${quote(row?.title)}`,
        changes,
        isCreate: false,
        conflict: conflictFor(row ?? null, area, item.baseUpdatedAt, false, true),
      };
    }
  }
}

export async function describeStored(db: DbOrTx, stored: StoredAction[]): Promise<ActionPreview[]> {
  return Promise.all(stored.map((item) => describeOne(db, item)));
}

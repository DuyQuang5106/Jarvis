import { isDeepStrictEqual } from 'node:util';
import { and, asc, eq, gt, ne } from 'drizzle-orm';
import type { Db, Tx } from '@/db/client';
import {
  activityLogs, areas, assessments, blockers, documents, milestones, notes, pendingActions, tasks, topics,
  type ActivityLogRow,
} from '@/db/schema';
import { addProgressLog, updateArea } from '../services/areas';
import { documentService } from '../services/documents';
import { ENTITY_SERVICES } from '../services/entities';
import type { WriteMeta } from '../services/activity';
import type { StoredProposal } from './schema';

export type UndoResult =
  | { status: 'undone' | 'unavailable' }
  | { status: 'conflict'; documents: { areaId: string; documentId: string }[] };
type Values = Record<string, unknown>;
const snapshot = (value: unknown) => (value ?? {}) as Values;
const tables = { area: areas, assessment: assessments, blocker: blockers, document: documents, milestone: milestones, note: notes, task: tasks, topic: topics };
type Entity = keyof typeof tables;

function comparable(row: Values, keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, row[key] instanceof Date ? row[key].toISOString() : row[key]]));
}

async function lockRow(tx: Tx, entity: Entity, id: string) {
  const table = tables[entity];
  const [row] = await tx.select().from(table).where(eq(table.id, id)).for('update');
  return row as Values | undefined;
}

type Change = { entity: Entity; id: string; first: ActivityLogRow; last: ActivityLogRow };

function sameSnapshot(left: unknown, right: unknown, entity: Entity) {
  if (entity !== 'area') return isDeepStrictEqual(left, right);
  const fields = (value: unknown) => Object.fromEntries(Object.entries(snapshot(value)).filter(([key]) => key !== 'updatedAt'));
  return isDeepStrictEqual(fields(left), fields(right));
}

function collectChanges(logs: ActivityLogRow[]): Change[] {
  const grouped = new Map<string, ActivityLogRow[]>();
  for (const log of logs) {
    if (!Object.hasOwn(tables, log.entityType) || log.action === 'progress') continue;
    const key = log.entityType + ':' + log.entityId;
    const group = grouped.get(key) ?? [];
    group.push(log);
    grouped.set(key, group);
  }
  return [...grouped.values()].map((group) => {
    const entity = group[0].entityType as Entity;
    // Structured logs in one SQL transaction can have the same timestamp.
    const first = group.find((log) => log.action === 'create') ?? group.find((log) =>
      !group.some((prior) => prior !== log && sameSnapshot(prior.afterJson, log.beforeJson, entity))) ?? group[0];
    const last = group.find((log) => !group.some((next) => next !== log &&
      sameSnapshot(log.afterJson, next.beforeJson, entity))) ?? group[group.length - 1];
    return { entity, id: first.entityId, first, last };
  });
}

async function compensate(tx: Tx, change: Change, current: Values, meta: WriteMeta) {
  const previous = snapshot(change.first.beforeJson);
  const created = change.first.action === 'create';
  if (change.entity === 'document') {
    if (created) await documentService.softDelete(tx, change.id, meta);
    else await documentService.applyRevision(tx, change.id, Number(current.revision),
      { title: String(previous.title), bodyMd: String(previous.bodyMd) }, meta);
    return;
  }
  const after = snapshot(change.last.afterJson);
  const patch = Object.fromEntries(Object.keys(previous).filter((key) => key !== 'updatedAt' && key !== 'createdAt' &&
    !isDeepStrictEqual(previous[key], after[key])).map((key) => [key, previous[key]]));
  if (change.entity === 'area') {
    await updateArea(tx, change.id, patch, meta);
    return;
  }
  const service = ENTITY_SERVICES[change.entity];
  if (created) await service.remove(tx, change.id, meta);
  else await service.update(tx, change.id, patch, meta);
}

export async function undoPendingAction(db: Db, id: string): Promise<UndoResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(pendingActions).where(eq(pendingActions.id, id)).for('update');
    if (!row || (row.status !== 'applied' && row.status !== 'partially_applied')) return { status: 'unavailable' };
    const stored = row.actionsJson as StoredProposal;
    if (!stored.batchId || stored.undoneAt) return { status: 'unavailable' };
    const logs = await tx.select().from(activityLogs).where(and(eq(activityLogs.batchId, stored.batchId), eq(activityLogs.origin, 'ai_approved')))
      .orderBy(asc(activityLogs.createdAt), asc(activityLogs.id));
    const changes = collectChanges(logs);
    const locked = new Map<Change, Values>();
    const documentConflicts: { areaId: string; documentId: string }[] = [];
    let hasConflict = false;
    for (const change of [...changes].sort((a, b) => (a.entity + a.id).localeCompare(b.entity + b.id))) {
      const current = await lockRow(tx, change.entity, change.id);
      const after = snapshot(change.last.afterJson);
      const keys = Object.keys(after).filter((key) => change.entity !== 'area' || (key !== 'details' && key !== 'updatedAt'));
      const [laterAreaWrite] = change.entity === 'area' ? await tx.select({ id: activityLogs.id }).from(activityLogs)
        .where(and(eq(activityLogs.entityType, 'area'), eq(activityLogs.entityId, change.id),
          ne(activityLogs.action, 'progress'), gt(activityLogs.createdAt, change.last.createdAt))).limit(1) : [];
      if (laterAreaWrite || !current || !isDeepStrictEqual(comparable(current, keys), comparable(after, keys))) {
        hasConflict = true;
        if (change.entity === 'document' && change.last.areaId && current && !current.deletedAt) {
          documentConflicts.push({ areaId: change.last.areaId, documentId: change.id });
        }
      } else {
        locked.set(change, current);
      }
    }
    for (const change of changes) {
      if (change.entity !== 'milestone' || change.first.action !== 'create') continue;
      const dependentTasks = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.milestoneId, change.id));
      if (dependentTasks.some((task) => !changes.some((candidate) => candidate.entity === 'task' && candidate.id === task.id &&
        (candidate.first.action === 'create' || snapshot(candidate.first.beforeJson).milestoneId !== change.id)))) hasConflict = true;
    }
    if (hasConflict) return { status: 'conflict', documents: documentConflicts };
    const meta: WriteMeta = { origin: 'undo', batchId: stored.batchId };
    const reverse = [...changes].reverse().sort((a, b) => Number(a.entity === 'milestone') - Number(b.entity === 'milestone'));
    for (const change of reverse) await compensate(tx, change, locked.get(change)!, meta);
    for (const log of logs.filter((log) => log.action === 'progress' && log.areaId)) {
      await addProgressLog(tx, log.areaId!, 'Đã hoàn tác ghi nhận tiến độ từ đề xuất AI.', meta);
    }
    await tx.update(pendingActions).set({ actionsJson: { ...stored, undoneAt: new Date().toISOString() } }).where(eq(pendingActions.id, id));
    return { status: 'undone' };
  });
}

import { and, eq } from 'drizzle-orm';
import type { Db, DbOrTx, Tx } from '@/db/client';
import {
  areas,
  assessments,
  blockers,
  documents,
  folders,
  milestones,
  pendingActions,
  tasks,
  topics,
} from '@/db/schema';
import { NotFoundError, ValidationError } from '../errors';
import { addProgressLog, updateArea } from '../services/areas';
import type { WriteMeta } from '../services/activity';
import { documentService } from '../services/documents';
import {
  assessmentService,
  blockerService,
  milestoneService,
  noteService,
  taskService,
  topicService,
} from '../services/entities';
import { editDocument, loadDocumentArea, loadEditableDocument, sectionHash, stampDocumentAction, isDocumentAction } from './document-actions';
import { DEADLINE_ROUTE_ERROR, hasDeadlineRoute } from './routing';
import { describeStored } from './describe';
import {
  ProposedActionSchema,
  type ProposedAction,
  type StoredAction,
  type StoredProposal,
} from './schema';

export type ApproveResult =
  | { status: 'applied' | 'partially_applied'; appliedKeys: number[]; batchId: string }
  | { status: 'conflict'; conflicts: { key: number; kind: 'changed' | 'missing' }[] }
  | { status: 'invalid'; errors: { key: number; message: string }[] }
  | { status: 'already_resolved' }
  | { status: 'failed'; error: string };

class RollbackWithResult extends Error {
  constructor(public readonly result: ApproveResult) {
    super('rollback');
  }
}

function sameIdentity(orig: ProposedAction, edited: ProposedAction): boolean {
  if (orig.type !== edited.type) return false;
  if ('documentId' in orig && (!('documentId' in edited) || orig.documentId !== edited.documentId)) return false;
  if (('heading' in orig || 'heading' in edited) &&
    ('heading' in orig ? orig.heading : undefined) !== ('heading' in edited ? edited.heading : undefined)) return false;
  if ('itemText' in orig && (!('itemText' in edited) || orig.itemText !== edited.itemText)) return false;
  if ('id' in orig && orig.id !== undefined) {
    if (!('id' in edited) || edited.id !== orig.id) return false;
  } else if ('id' in edited && edited.id !== undefined) {
    return false;
  }
  if ('areaId' in orig) {
    if (!('areaId' in edited) || edited.areaId !== orig.areaId) return false;
  }
  return true;
}

async function lockTarget(tx: Tx, action: ProposedAction): Promise<void> {
  if ('documentId' in action) {
    const [target] = await tx.select({ areaId: documents.areaId, folderId: documents.folderId }).from(documents)
      .where(eq(documents.id, action.documentId)).for('update');
    if (!target) return;
    await tx.select({ id: areas.id }).from(areas).where(eq(areas.id, target.areaId)).for('update');
    const visited = new Set<string>();
    let folderId = target.folderId;
    while (folderId && !visited.has(folderId)) {
      visited.add(folderId);
      const [parent] = await tx.select({ parentId: folders.parentId }).from(folders)
        .where(eq(folders.id, folderId)).for('share');
      folderId = parent?.parentId ?? null;
    }
    return;
  }
  switch (action.type) {
    case 'create_document':
      await tx.select({ id: areas.id }).from(areas).where(eq(areas.id, action.areaId)).for('update');
      return;
    case 'update_task':
      await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, action.id)).for('update');
      return;
    case 'update_area':
      await tx.select({ id: areas.id }).from(areas).where(eq(areas.id, action.id)).for('update');
      return;
    case 'resolve_blocker':
      await tx.select({ id: blockers.id }).from(blockers).where(eq(blockers.id, action.id)).for('update');
      return;
    case 'upsert_topic':
      if (action.id) {
        await tx.select({ id: topics.id }).from(topics).where(eq(topics.id, action.id)).for('update');
        return;
      }
      await tx.select({ id: areas.id }).from(areas).where(eq(areas.id, action.areaId)).for('update');
      return;
    case 'upsert_milestone':
      if (action.id) {
        await tx.select({ id: milestones.id }).from(milestones).where(eq(milestones.id, action.id)).for('update');
        return;
      }
      await tx.select({ id: areas.id }).from(areas).where(eq(areas.id, action.areaId)).for('update');
      return;
    case 'upsert_assessment':
      if (action.id) {
        await tx.select({ id: assessments.id }).from(assessments).where(eq(assessments.id, action.id)).for('update');
        return;
      }
      await tx.select({ id: areas.id }).from(areas).where(eq(areas.id, action.areaId)).for('update');
      return;
    case 'create_task':
    case 'add_progress_log':
    case 'create_blocker':
      await tx.select({ id: areas.id }).from(areas).where(eq(areas.id, action.areaId)).for('update');
      return;
    case 'create_note':
      if (action.areaId) {
        await tx.select({ id: areas.id }).from(areas).where(eq(areas.id, action.areaId)).for('update');
      }
      return;
  }
}

export async function applyAction(tx: DbOrTx, action: ProposedAction, meta: WriteMeta): Promise<void> {
  switch (action.type) {
    case 'create_document':
      if (!await loadDocumentArea(tx, action.areaId)) throw new ValidationError('Không thể truy cập workspace.');
      await documentService.create(tx, { areaId: action.areaId, title: action.title, bodyMd: action.markdown }, meta);
      return;
    case 'append_to_document':
    case 'replace_section':
    case 'set_checklist_item':
    case 'rename_document': {
      const target = await loadEditableDocument(tx, action.documentId);
      const edit = target && editDocument(target.doc, action);
      if (!target || !edit) throw new ValidationError('Không thể sửa tài liệu đích.');
      await documentService.applyRevision(tx, target.doc.id, target.doc.revision, { title: edit.title, bodyMd: edit.body }, meta);
      return;
    }
    case 'create_task': {
      const { type: _, ...input } = action;
      void _;
      await taskService.create(tx, input, meta);
      return;
    }
    case 'update_task':
      await taskService.update(tx, action.id, action.patch, meta);
      return;
    case 'update_area':
      await updateArea(tx, action.id, action.patch, meta);
      return;
    case 'upsert_topic': {
      const { type: _, id, areaId, ...rest } = action;
      void _;
      if (id) await topicService.update(tx, id, rest, meta);
      else await topicService.create(tx, { areaId, ...rest, title: action.title! }, meta);
      return;
    }
    case 'upsert_milestone': {
      const { type: _, id, areaId, ...rest } = action;
      void _;
      if (id) await milestoneService.update(tx, id, rest, meta);
      else await milestoneService.create(tx, { areaId, ...rest, title: action.title! }, meta);
      return;
    }
    case 'upsert_assessment': {
      const { type: _, id, areaId, ...rest } = action;
      void _;
      if (id) await assessmentService.update(tx, id, rest, meta);
      else await assessmentService.create(tx, { areaId, ...rest, title: action.title! }, meta);
      return;
    }
    case 'create_note':
      await noteService.create(tx, { areaId: action.areaId ?? null, text: action.text, inboxStatus: 'none' }, meta);
      return;
    case 'add_progress_log':
      await addProgressLog(tx, action.areaId, action.text, meta);
      return;
    case 'create_blocker': {
      const { type: _, ...input } = action;
      void _;
      await blockerService.create(tx, input, meta);
      return;
    }
    case 'resolve_blocker':
      await blockerService.update(tx, action.id, { status: 'resolved' }, meta);
      return;
  }
}

function targetKey(action: ProposedAction): string {
  if ('documentId' in action) return 'document:' + action.documentId;
  return action.type + ':' + ('id' in action && action.id ? action.id : 'areaId' in action ? action.areaId : '');
}

async function applyDocumentGroup(tx: Tx, id: string, items: StoredAction[], meta: WriteMeta) {
  const target = await loadEditableDocument(tx, id);
  if (!target) throw new ValidationError('Không thể sửa tài liệu đích.');
  let content = { title: target.doc.title, bodyMd: target.doc.bodyMd };
  for (const item of items) {
    const action = item.action;
    if (!('documentId' in action) || action.documentId !== id) continue;
    const edit = editDocument(content, action);
    if (!edit || item.sectionHash !== sectionHash(edit.anchor)) {
      throw new RollbackWithResult({ status: 'conflict', conflicts: [{ key: item.key, kind: 'changed' }] });
    }
    content = { title: edit.title, bodyMd: edit.body };
  }
  await documentService.applyRevision(tx, id, target.doc.revision, content, meta);
}

export async function approvePendingAction(
  db: Db,
  id: string,
  input: { selectedKeys: number[]; edits?: Record<number, unknown> },
): Promise<ApproveResult> {
  try {
    return await db.transaction(async (tx) => {
      const now = new Date();
      const [row] = await tx
        .update(pendingActions)
        .set({ status: 'applied', resolvedAt: now })
        .where(and(eq(pendingActions.id, id), eq(pendingActions.status, 'pending')))
        .returning();
      if (!row) throw new RollbackWithResult({ status: 'already_resolved' });

      const stored = row.actionsJson as StoredProposal;
      const byKey = new Map(stored.actions.map((a) => [a.key, a]));
      const uniqueKeys = [...new Set(input.selectedKeys)].sort((a, b) => a - b);
      if (uniqueKeys.length === 0 || uniqueKeys.some((k) => !byKey.has(k))) {
        throw new RollbackWithResult({
          status: 'invalid',
          errors: [{ key: -1, message: 'Lựa chọn hành động không hợp lệ.' }],
        });
      }

      const selected: StoredAction[] = [];
      for (const key of uniqueKeys) {
        const orig = byKey.get(key)!;
        if (input.edits && Object.hasOwn(input.edits, key)) {
          const parsed = ProposedActionSchema.safeParse(input.edits[key]);
          if (!parsed.success) {
            throw new RollbackWithResult({
              status: 'invalid',
              errors: [{ key, message: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.' }],
            });
          }
          if (!sameIdentity(orig.action, parsed.data)) {
            throw new RollbackWithResult({
              status: 'invalid',
              errors: [{ key, message: 'Không thể thay đổi đích của hành động.' }],
            });
          }
          selected.push({ ...orig, action: parsed.data });
        } else {
          selected.push(orig);
        }
      }

      if (stored.requiresDeadlineRoute && !hasDeadlineRoute(selected.map((item) => item.action))) {
        throw new RollbackWithResult({ status: 'invalid', errors: [{ key: -1, message: DEADLINE_ROUTE_ERROR }] });
      }

      const lockOrder = [...selected].sort((a, b) => targetKey(a.action).localeCompare(targetKey(b.action)));
      for (const item of lockOrder) await lockTarget(tx, item.action);

      const previews = await describeStored(tx, selected);
      const conflicts = previews
        .filter((p): p is typeof p & { conflict: 'changed' | 'missing' } => p.conflict !== 'none')
        .map((p) => ({ key: p.key, kind: p.conflict }));
      if (conflicts.length > 0) {
        throw new RollbackWithResult({ status: 'conflict', conflicts });
      }

      const batchId = crypto.randomUUID();
      const meta: WriteMeta = { origin: 'ai_approved', batchId };
      const updatedDocuments = new Set<string>();
      for (const item of selected) {
        try {
          if ('documentId' in item.action) {
            const id = item.action.documentId;
            if (updatedDocuments.has(id)) continue;
            await applyDocumentGroup(tx, id, selected, meta);
            updatedDocuments.add(id);
          } else {
            await applyAction(tx, item.action, meta);
          }
        } catch (err) {
          if (err instanceof ValidationError || err instanceof NotFoundError) {
            throw new RollbackWithResult({ status: 'invalid', errors: [{ key: item.key, message: err.message }] });
          }
          throw err;
        }
      }

      const finalStatus = uniqueKeys.length < stored.actions.length ? 'partially_applied' : 'applied';
      const selectedMap = new Map(selected.map((s) => [s.key, s]));
      const updatedActions = stored.actions.map((item) => selectedMap.get(item.key) ?? item);
      const updatedJson: StoredProposal = { ...stored, actions: updatedActions, appliedKeys: uniqueKeys, batchId };
      await tx
        .update(pendingActions)
        .set({ status: finalStatus, actionsJson: updatedJson })
        .where(eq(pendingActions.id, id));

      if (row.noteId) {
        await noteService.update(tx, row.noteId, { inboxStatus: 'processed' }, meta);
      }

      return { status: finalStatus, appliedKeys: uniqueKeys, batchId };
    });
  } catch (err) {
    if (err instanceof RollbackWithResult) return err.result;
    await db
      .update(pendingActions)
      .set({ status: 'failed', error: 'Không áp dụng được thay đổi.' })
      .where(and(eq(pendingActions.id, id), eq(pendingActions.status, 'pending')));
    return { status: 'failed', error: 'Không áp dụng được thay đổi.' };
  }
}

export async function rejectPendingAction(
  db: Db,
  id: string,
): Promise<{ status: 'rejected' | 'already_resolved' }> {
  const rows = await db
    .update(pendingActions)
    .set({ status: 'rejected', resolvedAt: new Date() })
    .where(and(eq(pendingActions.id, id), eq(pendingActions.status, 'pending')))
    .returning({ id: pendingActions.id });
  return rows.length > 0 ? { status: 'rejected' } : { status: 'already_resolved' };
}

async function currentUpdatedAt(db: DbOrTx, action: ProposedAction): Promise<string | null> {
  switch (action.type) {
    case 'update_task': {
      const [r] = await db.select({ updatedAt: tasks.updatedAt }).from(tasks).where(eq(tasks.id, action.id));
      return r ? r.updatedAt.toISOString() : null;
    }
    case 'update_area': {
      const [r] = await db.select({ updatedAt: areas.updatedAt }).from(areas).where(eq(areas.id, action.id));
      return r ? r.updatedAt.toISOString() : null;
    }
    case 'resolve_blocker': {
      const [r] = await db.select({ updatedAt: blockers.updatedAt }).from(blockers).where(eq(blockers.id, action.id));
      return r ? r.updatedAt.toISOString() : null;
    }
    case 'upsert_topic': {
      if (!action.id) return null;
      const [r] = await db.select({ updatedAt: topics.updatedAt }).from(topics).where(eq(topics.id, action.id));
      return r ? r.updatedAt.toISOString() : null;
    }
    case 'upsert_milestone': {
      if (!action.id) return null;
      const [r] = await db.select({ updatedAt: milestones.updatedAt }).from(milestones).where(eq(milestones.id, action.id));
      return r ? r.updatedAt.toISOString() : null;
    }
    case 'upsert_assessment': {
      if (!action.id) return null;
      const [r] = await db.select({ updatedAt: assessments.updatedAt }).from(assessments).where(eq(assessments.id, action.id));
      return r ? r.updatedAt.toISOString() : null;
    }
    default:
      return null;
  }
}

export async function rebasePendingAction(
  db: Db,
  id: string,
): Promise<{ status: 'rebased' | 'already_resolved' }> {
  const [row] = await db
    .select()
    .from(pendingActions)
    .where(and(eq(pendingActions.id, id), eq(pendingActions.status, 'pending')));
  if (!row) return { status: 'already_resolved' };

  const stored = row.actionsJson as StoredProposal;
  const rebased: StoredAction[] = await Promise.all(
    stored.actions.map(async (item) => {
      if (isDocumentAction(item.action)) {
        const stamp = await stampDocumentAction(db, item.action);
        return stamp ? { ...item, ...stamp } : item;
      }
      const nextAt = await currentUpdatedAt(db, item.action);
      return nextAt ? { ...item, baseUpdatedAt: nextAt } : item;
    }),
  );

  const updated = await db
    .update(pendingActions)
    .set({ actionsJson: { ...stored, actions: rebased } satisfies StoredProposal })
    .where(and(eq(pendingActions.id, id), eq(pendingActions.status, 'pending')))
    .returning({ id: pendingActions.id });
  return updated.length > 0 ? { status: 'rebased' } : { status: 'already_resolved' };
}

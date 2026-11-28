import { and, asc, desc, eq, inArray, isNull, max } from 'drizzle-orm';
import type { DbOrTx, Tx } from '@/db/client';
import {
  activityLogs,
  areas,
  documentVersions,
  documents,
  folders,
  type ActivityLogRow,
  type DocumentRow,
  type DocumentVersionRow,
} from '@/db/schema';
import type { DocRole } from '@/db/enums';
import { z } from 'zod';
import { normalizeVi } from '../ai/match-areas';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import {
  CreateDocumentInput,
  DocumentBody,
  DocumentTitle,
  MAX_SEARCH_SOURCE_CHARS,
  MoveDocumentInput,
  ReorderDocumentsInput,
  SetDocumentRoleInput,
} from '../schemas';
import { recordChange, touchArea, type WriteMeta } from './activity';

export const SESSION_WINDOW_MS = 5 * 60 * 1000;
export const MAX_VERSIONS_PER_DOC = 50;

type Opts = { now?: Date; createdAt?: Date; touchArea?: boolean };

function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.');
  return result.data;
}

export function computeSearchText(title: string, bodyMd: string, extractedText = ''): string {
  const combined = extractedText ? `${title}\n${bodyMd}\n${extractedText}` : `${title}\n${bodyMd}`;
  const clipped = combined.length > MAX_SEARCH_SOURCE_CHARS ? combined.slice(0, MAX_SEARCH_SOURCE_CHARS) : combined;
  return normalizeVi(clipped);
}

function stripSearch(doc: DocumentRow): Omit<DocumentRow, 'searchText' | 'searchTsv' | 'extractedText'> {
  const { searchText: _s, searchTsv: _t, extractedText: _e, ...rest } = doc;
  void _s;
  void _t;
  void _e;
  return rest;
}

function isBodyUpdateLog(log: ActivityLogRow): boolean {
  const b = (log.beforeJson as { bodyMd?: unknown } | null)?.bodyMd;
  const a = (log.afterJson as { bodyMd?: unknown } | null)?.bodyMd;
  return b !== a;
}

async function loadActiveDoc(tx: Tx, id: string): Promise<DocumentRow> {
  const [doc] = await tx
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), isNull(documents.deletedAt))).for('update');
  if (!doc) throw new NotFoundError('Không tìm thấy tài liệu.');
  return doc;
}

/** Keeps the newest MAX_VERSIONS_PER_DOC unpinned versions; pinned ones are kept on top of those, forever. */
async function pruneVersions(tx: Tx, documentId: string): Promise<void> {
  const rows = await tx
    .select({ id: documentVersions.id, origin: documentVersions.origin })
    .from(documentVersions)
    .where(and(eq(documentVersions.documentId, documentId), eq(documentVersions.pinned, false)))
    .orderBy(asc(documentVersions.revision), asc(documentVersions.createdAt));
  if (rows.length <= MAX_VERSIONS_PER_DOC) return;
  let overflow = rows.length - MAX_VERSIONS_PER_DOC;
  const toDelete: string[] = [];
  for (const r of rows) {
    if (overflow <= 0) break;
    if (r.origin === 'manual') {
      toDelete.push(r.id);
      overflow -= 1;
    }
  }
  for (const r of rows) {
    if (overflow <= 0) break;
    if (!toDelete.includes(r.id)) {
      toDelete.push(r.id);
      overflow -= 1;
    }
  }
  if (toDelete.length > 0) {
    await tx.delete(documentVersions).where(inArray(documentVersions.id, toDelete));
  }
}

export const documentService = {
  async create(db: DbOrTx, rawInput: z.input<typeof CreateDocumentInput>, meta: WriteMeta, opts?: Opts): Promise<DocumentRow> {
    const input = parseOrThrow(CreateDocumentInput, rawInput);
    const now = opts?.now ?? new Date();
    return db.transaction(async (tx) => {
      const [area] = await tx.select({ id: areas.id }).from(areas).where(eq(areas.id, input.areaId));
      if (!area) throw new NotFoundError('Không tìm thấy mục.');

      const folderId = input.folderId ?? null;
      if (folderId) {
        const [folder] = await tx
          .select({ id: folders.id, areaId: folders.areaId, deletedAt: folders.deletedAt })
          .from(folders)
          .where(eq(folders.id, folderId));
        if (!folder || folder.deletedAt !== null || folder.areaId !== input.areaId) {
          throw new ValidationError('Thư mục không hợp lệ hoặc không thuộc mục này.');
        }
      }

      let sortOrder = input.sortOrder;
      if (sortOrder === undefined) {
        const [{ last }] = await tx
          .select({ last: max(documents.sortOrder) })
          .from(documents)
          .where(and(eq(documents.areaId, input.areaId), isNull(documents.deletedAt)));
        sortOrder = (last ?? -1) + 1;
      }

      const bodyMd = input.bodyMd ?? '';
      const extractedText = input.extractedText ?? '';
      const searchText = computeSearchText(input.title, bodyMd, extractedText);
      const createdAt = opts?.createdAt ?? now;
      const [doc] = await tx
        .insert(documents)
        .values({
          areaId: input.areaId,
          folderId,
          title: input.title,
          bodyMd,
          docRole: input.docRole ?? 'context',
          mimeType: input.mimeType ?? 'text/markdown',
          fileExt: input.fileExt ?? 'md',
          storageKey: input.storageKey ?? null,
          sizeBytes: input.sizeBytes ?? null,
          extractedText,
          sortOrder,
          templateKey: input.templateKey ?? null,
          aiExcluded: input.aiExcluded ?? false,
          revision: 1,
          searchText,
          createdAt,
          updatedAt: now,
        })
        .returning();

      await tx.insert(documentVersions).values({
        documentId: doc.id,
        revision: doc.revision,
        title: doc.title,
        bodyMd: doc.bodyMd,
        origin: meta.origin,
        batchId: meta.batchId ?? null,
        createdAt: now,
      });

      await recordChange(tx, {
        areaId: doc.areaId,
        entityType: 'document',
        entityId: doc.id,
        action: 'create',
        after: stripSearch(doc),
        createdAt: now,
        ...meta,
      });
      if (opts?.touchArea !== false) await touchArea(tx, doc.areaId, now);
      return doc;
    });
  },

  async applyRevision(
    db: DbOrTx,
    id: string,
    expectedRevision: number,
    input: { title: string; bodyMd: string },
    meta: WriteMeta,
    /** `keepPrevious`: pin the version being replaced so pruning never drops it (rewrites that summarise text). */
    opts: { keepPrevious?: boolean } = {},
  ): Promise<DocumentRow> {
    const title = parseOrThrow(DocumentTitle, input.title);
    const bodyMd = parseOrThrow(DocumentBody, input.bodyMd);
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(documents)
        .where(and(eq(documents.id, id), isNull(documents.deletedAt))).for('update');
      if (!current) throw new NotFoundError('Không tìm thấy tài liệu.');
      if (current.revision !== expectedRevision) throw new ConflictError('Tài liệu đã thay đổi ở nơi khác.');
      if (current.title === title && current.bodyMd === bodyMd) return current;
      const now = new Date();
      // The text being replaced must stay restorable: a document whose current revision has no version row
      // (written outside this service) gets one first.
      const [kept] = await tx.select({ id: documentVersions.id }).from(documentVersions)
        .where(and(eq(documentVersions.documentId, id), eq(documentVersions.revision, current.revision))).limit(1);
      if (!kept) {
        await tx.insert(documentVersions).values({
          documentId: id, revision: current.revision, title: current.title, bodyMd: current.bodyMd,
          origin: 'manual', batchId: null, createdAt: current.updatedAt, pinned: opts.keepPrevious === true,
        });
      } else if (opts.keepPrevious) {
        await tx.update(documentVersions).set({ pinned: true }).where(eq(documentVersions.id, kept.id));
      }
      const [updated] = await tx.update(documents).set({
        title, bodyMd, revision: current.revision + 1, updatedAt: now,
        searchText: computeSearchText(title, bodyMd, current.extractedText),
      }).where(eq(documents.id, id)).returning();
      await tx.insert(documentVersions).values({
        documentId: id, revision: updated.revision, title, bodyMd,
        origin: meta.origin, batchId: meta.batchId ?? null, createdAt: now,
      });
      await pruneVersions(tx, id);
      await recordChange(tx, {
        ...meta, areaId: updated.areaId, entityType: 'document', entityId: id, action: 'update',
        before: stripSearch(current), after: stripSearch(updated), createdAt: now,
      });
      await touchArea(tx, updated.areaId, now);
      return updated;
    });
  },

  async rename(db: DbOrTx, id: string, rawTitle: string, meta: WriteMeta, opts?: Opts): Promise<DocumentRow> {
    const title = parseOrThrow(DocumentTitle, rawTitle);
    const now = opts?.now ?? new Date();
    return db.transaction(async (tx) => {
      const current = await loadActiveDoc(tx, id);
      if (current.title === title) return current;
      const [updated] = await tx
        .update(documents)
        .set({ title, searchText: computeSearchText(title, current.bodyMd, current.extractedText), updatedAt: now })
        .where(eq(documents.id, id))
        .returning();
      await recordChange(tx, {
        areaId: updated.areaId,
        entityType: 'document',
        entityId: updated.id,
        action: 'update',
        before: stripSearch(current),
        after: stripSearch(updated),
        createdAt: now,
        ...meta,
      });
      await touchArea(tx, updated.areaId, now);
      return updated;
    });
  },

  async move(db: DbOrTx, id: string, folderId: string | null, meta: WriteMeta, opts?: Opts): Promise<DocumentRow> {
    const parsed = parseOrThrow(MoveDocumentInput, { id, folderId });
    const now = opts?.now ?? new Date();
    return db.transaction(async (tx) => {
      const current = await loadActiveDoc(tx, parsed.id);
      if (current.folderId === parsed.folderId) return current;
      if (parsed.folderId) {
        const [folder] = await tx
          .select({ id: folders.id, areaId: folders.areaId, deletedAt: folders.deletedAt })
          .from(folders)
          .where(eq(folders.id, parsed.folderId));
        if (!folder || folder.deletedAt !== null || folder.areaId !== current.areaId) {
          throw new ValidationError('Thư mục đích không thuộc mục này hoặc đã bị xóa.');
        }
      }
      const [updated] = await tx
        .update(documents)
        .set({ folderId: parsed.folderId, updatedAt: now })
        .where(eq(documents.id, current.id))
        .returning();
      await recordChange(tx, {
        areaId: updated.areaId,
        entityType: 'document',
        entityId: updated.id,
        action: 'update',
        before: stripSearch(current),
        after: stripSearch(updated),
        createdAt: now,
        ...meta,
      });
      await touchArea(tx, updated.areaId, now);
      return updated;
    });
  },

  async setRole(db: DbOrTx, id: string, docRole: DocRole, meta: WriteMeta, opts?: Opts): Promise<DocumentRow> {
    const parsed = parseOrThrow(SetDocumentRoleInput, { id, docRole });
    const now = opts?.now ?? new Date();
    return db.transaction(async (tx) => {
      const current = await loadActiveDoc(tx, parsed.id);
      if (current.docRole === parsed.docRole) return current;
      const [updated] = await tx
        .update(documents)
        .set({ docRole: parsed.docRole, updatedAt: now })
        .where(eq(documents.id, current.id))
        .returning();
      await recordChange(tx, {
        areaId: updated.areaId,
        entityType: 'document',
        entityId: updated.id,
        action: 'update',
        before: stripSearch(current),
        after: stripSearch(updated),
        createdAt: now,
        ...meta,
      });
      await touchArea(tx, updated.areaId, now);
      return updated;
    });
  },

  async setAiExcluded(db: DbOrTx, id: string, aiExcluded: boolean, meta: WriteMeta, opts?: Opts): Promise<DocumentRow> {
    const now = opts?.now ?? new Date();
    return db.transaction(async (tx) => {
      const current = await loadActiveDoc(tx, id);
      if (current.aiExcluded === aiExcluded) return current;
      const [updated] = await tx
        .update(documents)
        .set({ aiExcluded, updatedAt: now })
        .where(eq(documents.id, id))
        .returning();
      await recordChange(tx, {
        areaId: updated.areaId,
        entityType: 'document',
        entityId: updated.id,
        action: 'update',
        before: stripSearch(current),
        after: stripSearch(updated),
        createdAt: now,
        ...meta,
      });
      await touchArea(tx, updated.areaId, now);
      return updated;
    });
  },

  async updateBody(
    db: DbOrTx,
    id: string,
    rawBodyMd: string,
    expectedRevision: number,
    meta: WriteMeta,
    opts?: Opts,
  ): Promise<DocumentRow> {
    const bodyMd = parseOrThrow(DocumentBody, rawBodyMd);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      throw new ValidationError('Phiên bản tài liệu không hợp lệ.');
    }
    const now = opts?.now ?? new Date();
    return db.transaction(async (tx) => {
      const current = await loadActiveDoc(tx, id);
      if (current.revision !== expectedRevision) {
        throw new ConflictError('Tài liệu đã thay đổi ở nơi khác.');
      }
      if (current.bodyMd === bodyMd) return current;

      const [latestDocLog] = await tx
        .select()
        .from(activityLogs)
        .where(eq(activityLogs.entityType, 'document'))
        .orderBy(desc(activityLogs.createdAt), desc(activityLogs.id))
        .limit(1);

      const canCoalesce =
        Boolean(latestDocLog) &&
        latestDocLog.entityId === id &&
        latestDocLog.action === 'update' &&
        latestDocLog.origin === 'manual' &&
        meta.origin === 'manual' &&
        now.getTime() - latestDocLog.createdAt.getTime() < SESSION_WINDOW_MS &&
        isBodyUpdateLog(latestDocLog);

      const nextRevision = current.revision + 1;
      const [updated] = await tx
        .update(documents)
        .set({
          bodyMd,
          revision: nextRevision,
          searchText: computeSearchText(current.title, bodyMd, current.extractedText),
          updatedAt: now,
        })
        .where(eq(documents.id, id))
        .returning();

      if (canCoalesce) {
        await tx
          .update(activityLogs)
          .set({ afterJson: stripSearch(updated), createdAt: now })
          .where(eq(activityLogs.id, latestDocLog.id));
      } else {
        await tx.insert(activityLogs).values({
          areaId: updated.areaId,
          entityType: 'document',
          entityId: updated.id,
          action: 'update',
          beforeJson: stripSearch(current),
          afterJson: stripSearch(updated),
          origin: meta.origin,
          batchId: meta.batchId ?? null,
          createdAt: now,
        });
        await tx.insert(documentVersions).values({
          documentId: updated.id,
          revision: updated.revision,
          title: updated.title,
          bodyMd: updated.bodyMd,
          origin: meta.origin,
          batchId: meta.batchId ?? null,
          createdAt: now,
        });
        await pruneVersions(tx, updated.id);
      }

      await touchArea(tx, updated.areaId, now);
      return updated;
    });
  },

  async reorder(db: DbOrTx, areaId: string, orderedIds: string[], meta: WriteMeta, opts?: Opts): Promise<void> {
    const parsed = parseOrThrow(ReorderDocumentsInput, { areaId, orderedIds });
    const now = opts?.now ?? new Date();
    await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(documents)
        .where(and(eq(documents.areaId, parsed.areaId), isNull(documents.deletedAt)))
        .orderBy(asc(documents.sortOrder), asc(documents.createdAt));

      const byId = new Map(rows.map((r) => [r.id, r]));
      if (parsed.orderedIds.length !== rows.length || new Set(parsed.orderedIds).size !== rows.length) {
        throw new ValidationError('Danh sách sắp xếp tài liệu không hợp lệ.');
      }
      for (const id of parsed.orderedIds) {
        if (!byId.has(id)) throw new ValidationError('Tài liệu không thuộc mục này.');
      }

      const batchId = meta.batchId ?? crypto.randomUUID();
      let changed = false;
      for (let i = 0; i < parsed.orderedIds.length; i += 1) {
        const cur = byId.get(parsed.orderedIds[i])!;
        if (cur.sortOrder === i) continue;
        changed = true;
        const [updated] = await tx
          .update(documents)
          .set({ sortOrder: i, updatedAt: now })
          .where(eq(documents.id, cur.id))
          .returning();
        await recordChange(tx, {
          areaId: updated.areaId,
          entityType: 'document',
          entityId: updated.id,
          action: 'update',
          before: stripSearch(cur),
          after: stripSearch(updated),
          origin: meta.origin,
          batchId,
          createdAt: now,
        });
      }
      if (changed) await touchArea(tx, parsed.areaId, now);
    });
  },

  async softDelete(db: DbOrTx, id: string, meta: WriteMeta, opts?: Opts): Promise<DocumentRow> {
    const now = opts?.now ?? new Date();
    return db.transaction(async (tx) => {
      const current = await loadActiveDoc(tx, id);
      const [deleted] = await tx
        .update(documents)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(documents.id, id))
        .returning();
      await recordChange(tx, {
        areaId: deleted.areaId,
        entityType: 'document',
        entityId: deleted.id,
        action: 'delete',
        before: stripSearch(current),
        after: stripSearch(deleted),
        createdAt: now,
        ...meta,
      });
      await touchArea(tx, deleted.areaId, now);
      return deleted;
    });
  },

  async restore(db: DbOrTx, id: string, meta: WriteMeta, opts?: Opts): Promise<DocumentRow> {
    const now = opts?.now ?? new Date();
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(documents).where(eq(documents.id, id));
      if (!current) throw new NotFoundError('Không tìm thấy tài liệu.');
      if (current.deletedAt === null) return current;
      const [restored] = await tx
        .update(documents)
        .set({ deletedAt: null, updatedAt: now })
        .where(eq(documents.id, id))
        .returning();
      await recordChange(tx, {
        areaId: restored.areaId,
        entityType: 'document',
        entityId: restored.id,
        action: 'update',
        before: stripSearch(current),
        after: stripSearch(restored),
        createdAt: now,
        ...meta,
      });
      await touchArea(tx, restored.areaId, now);
      return restored;
    });
  },

  async restoreVersion(
    db: DbOrTx,
    documentId: string,
    versionId: string,
    meta: WriteMeta,
    opts?: Opts,
  ): Promise<DocumentRow> {
    const now = opts?.now ?? new Date();
    return db.transaction(async (tx) => {
      const current = await loadActiveDoc(tx, documentId);
      const [ver]: DocumentVersionRow[] = await tx
        .select()
        .from(documentVersions)
        .where(and(eq(documentVersions.id, versionId), eq(documentVersions.documentId, documentId)));
      if (!ver) throw new NotFoundError('Không tìm thấy phiên bản tài liệu.');

      const nextRevision = current.revision + 1;
      const [updated] = await tx
        .update(documents)
        .set({
          title: ver.title,
          bodyMd: ver.bodyMd,
          revision: nextRevision,
          searchText: computeSearchText(ver.title, ver.bodyMd, current.extractedText),
          updatedAt: now,
        })
        .where(eq(documents.id, documentId))
        .returning();

      await tx.insert(documentVersions).values({
        documentId: updated.id,
        revision: updated.revision,
        title: updated.title,
        bodyMd: updated.bodyMd,
        origin: meta.origin,
        batchId: meta.batchId ?? null,
        createdAt: now,
      });
      await pruneVersions(tx, updated.id);

      await recordChange(tx, {
        areaId: updated.areaId,
        entityType: 'document',
        entityId: updated.id,
        action: 'update',
        before: stripSearch(current),
        after: stripSearch(updated),
        createdAt: now,
        ...meta,
      });
      await touchArea(tx, updated.areaId, now);
      return updated;
    });
  },
};

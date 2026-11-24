import { and, asc, eq, inArray, isNull, max } from 'drizzle-orm';
import { z } from 'zod';
import type { DbOrTx, Tx } from '@/db/client';
import { areas, documents, folders, type FolderRow } from '@/db/schema';
import { NotFoundError, ValidationError } from '../errors';
import {
  CreateFolderInput,
  FolderName,
  MoveFolderInput,
  ReorderFoldersInput,
} from '../schemas';
import { recordChange, touchArea, type WriteMeta } from './activity';

type Opts = { now?: Date; touchArea?: boolean };

function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.');
  return result.data;
}

async function loadActiveFolder(tx: Tx, id: string): Promise<FolderRow> {
  const [row] = await tx
    .select()
    .from(folders)
    .where(and(eq(folders.id, id), isNull(folders.deletedAt)));
  if (!row) throw new NotFoundError('Không tìm thấy thư mục.');
  return row;
}

async function collectDescendantFolderIds(tx: Tx, areaId: string, rootId: string): Promise<string[]> {
  const all = await tx
    .select({ id: folders.id, parentId: folders.parentId })
    .from(folders)
    .where(and(eq(folders.areaId, areaId), isNull(folders.deletedAt)));
  const byParent = new Map<string | null, string[]>();
  for (const f of all) {
    const list = byParent.get(f.parentId) ?? [];
    list.push(f.id);
    byParent.set(f.parentId, list);
  }
  const result: string[] = [rootId];
  for (let i = 0; i < result.length; i += 1) {
    const children = byParent.get(result[i]) ?? [];
    for (const c of children) result.push(c);
  }
  return result;
}

export const folderService = {
  async create(db: DbOrTx, rawInput: z.input<typeof CreateFolderInput>, meta: WriteMeta, opts?: Opts): Promise<FolderRow> {
    const input = parseOrThrow(CreateFolderInput, rawInput);
    const now = opts?.now ?? new Date();
    return db.transaction(async (tx) => {
      const [area] = await tx.select({ id: areas.id }).from(areas).where(eq(areas.id, input.areaId));
      if (!area) throw new NotFoundError('Không tìm thấy mục.');

      const parentId = input.parentId ?? null;
      if (parentId) {
        const parent = await loadActiveFolder(tx, parentId);
        if (parent.areaId !== input.areaId) {
          throw new ValidationError('Thư mục cha không thuộc mục này.');
        }
      }

      let sortOrder = input.sortOrder;
      if (sortOrder === undefined) {
        const [{ last }] = await tx
          .select({ last: max(folders.sortOrder) })
          .from(folders)
          .where(
            and(
              eq(folders.areaId, input.areaId),
              parentId ? eq(folders.parentId, parentId) : isNull(folders.parentId),
              isNull(folders.deletedAt),
            ),
          );
        sortOrder = (last ?? -1) + 1;
      }

      const [folder] = await tx
        .insert(folders)
        .values({
          areaId: input.areaId,
          parentId,
          name: input.name,
          sortOrder,
          aiExcluded: input.aiExcluded ?? false,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await recordChange(tx, {
        areaId: folder.areaId,
        entityType: 'folder',
        entityId: folder.id,
        action: 'create',
        after: folder,
        createdAt: now,
        ...meta,
      });
      if (opts?.touchArea !== false) await touchArea(tx, folder.areaId, now);
      return folder;
    });
  },

  async rename(db: DbOrTx, id: string, rawName: string, meta: WriteMeta, opts?: Opts): Promise<FolderRow> {
    const name = parseOrThrow(FolderName, rawName);
    const now = opts?.now ?? new Date();
    return db.transaction(async (tx) => {
      const current = await loadActiveFolder(tx, id);
      if (current.name === name) return current;
      const [updated] = await tx
        .update(folders)
        .set({ name, updatedAt: now })
        .where(eq(folders.id, id))
        .returning();
      await recordChange(tx, {
        areaId: updated.areaId,
        entityType: 'folder',
        entityId: updated.id,
        action: 'update',
        before: current,
        after: updated,
        createdAt: now,
        ...meta,
      });
      await touchArea(tx, updated.areaId, now);
      return updated;
    });
  },

  async move(db: DbOrTx, id: string, parentId: string | null, meta: WriteMeta, opts?: Opts): Promise<FolderRow> {
    const parsed = parseOrThrow(MoveFolderInput, { id, parentId });
    const now = opts?.now ?? new Date();
    return db.transaction(async (tx) => {
      const current = await loadActiveFolder(tx, parsed.id);
      if (current.parentId === parsed.parentId) return current;
      if (parsed.parentId === current.id) {
        throw new ValidationError('Không thể di chuyển thư mục vào chính nó.');
      }

      if (parsed.parentId) {
        const all = await tx
          .select()
          .from(folders)
          .where(and(eq(folders.areaId, current.areaId), isNull(folders.deletedAt)));
        const byId = new Map(all.map((f) => [f.id, f]));
        let cursor: string | null = parsed.parentId;
        const visited = new Set<string>();
        while (cursor) {
          if (cursor === current.id) {
            throw new ValidationError('Không thể di chuyển thư mục vào thư mục con của nó.');
          }
          if (visited.has(cursor)) break;
          visited.add(cursor);
          const node = byId.get(cursor);
          if (!node) throw new ValidationError('Thư mục đích không thuộc mục này hoặc đã bị xóa.');
          cursor = node.parentId;
        }
      }

      const [updated] = await tx
        .update(folders)
        .set({ parentId: parsed.parentId, updatedAt: now })
        .where(eq(folders.id, current.id))
        .returning();
      await recordChange(tx, {
        areaId: updated.areaId,
        entityType: 'folder',
        entityId: updated.id,
        action: 'update',
        before: current,
        after: updated,
        createdAt: now,
        ...meta,
      });
      await touchArea(tx, updated.areaId, now);
      return updated;
    });
  },

  async setAiExcluded(db: DbOrTx, id: string, aiExcluded: boolean, meta: WriteMeta, opts?: Opts): Promise<FolderRow> {
    const now = opts?.now ?? new Date();
    return db.transaction(async (tx) => {
      const current = await loadActiveFolder(tx, id);
      if (current.aiExcluded === aiExcluded) return current;
      const [updated] = await tx
        .update(folders)
        .set({ aiExcluded, updatedAt: now })
        .where(eq(folders.id, id))
        .returning();
      await recordChange(tx, {
        areaId: updated.areaId,
        entityType: 'folder',
        entityId: updated.id,
        action: 'update',
        before: current,
        after: updated,
        createdAt: now,
        ...meta,
      });
      await touchArea(tx, updated.areaId, now);
      return updated;
    });
  },

  async reorder(db: DbOrTx, areaId: string, parentId: string | null, orderedIds: string[], meta: WriteMeta, opts?: Opts): Promise<void> {
    const parsed = parseOrThrow(ReorderFoldersInput, { areaId, parentId, orderedIds });
    const now = opts?.now ?? new Date();
    await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(folders)
        .where(
          and(
            eq(folders.areaId, parsed.areaId),
            parsed.parentId ? eq(folders.parentId, parsed.parentId) : isNull(folders.parentId),
            isNull(folders.deletedAt),
          ),
        )
        .orderBy(asc(folders.sortOrder), asc(folders.createdAt));

      const byId = new Map(rows.map((r) => [r.id, r]));
      if (parsed.orderedIds.length !== rows.length || new Set(parsed.orderedIds).size !== rows.length) {
        throw new ValidationError('Danh sách sắp xếp thư mục không hợp lệ.');
      }
      for (const fid of parsed.orderedIds) {
        if (!byId.has(fid)) throw new ValidationError('Thư mục không thuộc cấp này.');
      }

      const batchId = meta.batchId ?? crypto.randomUUID();
      let changed = false;
      for (let i = 0; i < parsed.orderedIds.length; i += 1) {
        const cur = byId.get(parsed.orderedIds[i])!;
        if (cur.sortOrder === i) continue;
        changed = true;
        const [updated] = await tx
          .update(folders)
          .set({ sortOrder: i, updatedAt: now })
          .where(eq(folders.id, cur.id))
          .returning();
        await recordChange(tx, {
          areaId: updated.areaId,
          entityType: 'folder',
          entityId: updated.id,
          action: 'update',
          before: cur,
          after: updated,
          origin: meta.origin,
          batchId,
          createdAt: now,
        });
      }
      if (changed) await touchArea(tx, parsed.areaId, now);
    });
  },

  /** Soft-deletes the folder, all active descendant folders, and active documents inside the subtree. */
  async softDelete(db: DbOrTx, id: string, meta: WriteMeta, opts?: Opts): Promise<FolderRow> {
    const now = opts?.now ?? new Date();
    return db.transaction(async (tx) => {
      const current = await loadActiveFolder(tx, id);
      const subtreeIds = await collectDescendantFolderIds(tx, current.areaId, current.id);
      const batchId = meta.batchId ?? crypto.randomUUID();

      const deletedFolders = await tx
        .update(folders)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(inArray(folders.id, subtreeIds), isNull(folders.deletedAt)))
        .returning();

      const deletedDocs = await tx
        .update(documents)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(inArray(documents.folderId, subtreeIds), isNull(documents.deletedAt)))
        .returning();

      for (const f of deletedFolders) {
        await recordChange(tx, {
          areaId: f.areaId,
          entityType: 'folder',
          entityId: f.id,
          action: 'delete',
          before: { ...f, deletedAt: null },
          after: f,
          origin: meta.origin,
          batchId,
          createdAt: now,
        });
      }
      for (const d of deletedDocs) {
        await recordChange(tx, {
          areaId: d.areaId,
          entityType: 'document',
          entityId: d.id,
          action: 'delete',
          before: { id: d.id, title: d.title, folderId: d.folderId, aiExcluded: d.aiExcluded },
          after: { id: d.id, title: d.title, deletedAt: d.deletedAt },
          origin: meta.origin,
          batchId,
          createdAt: now,
        });
      }

      await touchArea(tx, current.areaId, now);
      return deletedFolders.find((f) => f.id === current.id) ?? { ...current, deletedAt: now, updatedAt: now };
    });
  },

  async restore(db: DbOrTx, id: string, meta: WriteMeta, opts?: Opts): Promise<FolderRow> {
    const now = opts?.now ?? new Date();
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(folders).where(eq(folders.id, id));
      if (!current) throw new NotFoundError('Không tìm thấy thư mục.');
      if (current.deletedAt === null) return current;

      let nextParentId = current.parentId;
      if (nextParentId) {
        const [parent] = await tx
          .select({ id: folders.id, deletedAt: folders.deletedAt })
          .from(folders)
          .where(eq(folders.id, nextParentId));
        if (!parent || parent.deletedAt !== null) nextParentId = null;
      }

      const [restored] = await tx
        .update(folders)
        .set({ deletedAt: null, parentId: nextParentId, updatedAt: now })
        .where(eq(folders.id, id))
        .returning();
      await recordChange(tx, {
        areaId: restored.areaId,
        entityType: 'folder',
        entityId: restored.id,
        action: 'update',
        before: current,
        after: restored,
        createdAt: now,
        ...meta,
      });
      await touchArea(tx, restored.areaId, now);
      return restored;
    });
  },
};

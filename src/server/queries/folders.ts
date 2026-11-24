import { and, asc, eq, isNull } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import { folders, type FolderRow } from '@/db/schema';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listFolders(db: DbOrTx, areaId: string): Promise<FolderRow[]> {
  if (!UUID.test(areaId)) return [];
  return db
    .select()
    .from(folders)
    .where(and(eq(folders.areaId, areaId), isNull(folders.deletedAt)))
    .orderBy(asc(folders.sortOrder), asc(folders.createdAt));
}

/**
 * Computes the set of folder IDs that are excluded from AI either directly (`aiExcluded = true`)
 * or by inheriting exclusion from any ancestor folder.
 */
export function collectExcludedFolderIds(allFolders: Pick<FolderRow, 'id' | 'parentId' | 'aiExcluded'>[]): Set<string> {
  const byParent = new Map<string | null, typeof allFolders>();
  const roots: typeof allFolders = [];
  for (const f of allFolders) {
    const list = byParent.get(f.parentId) ?? [];
    list.push(f);
    byParent.set(f.parentId, list);
    if (f.aiExcluded) roots.push(f);
  }
  const excluded = new Set<string>();
  const queue = roots.map((r) => r.id);
  for (let i = 0; i < queue.length; i += 1) {
    const id = queue[i];
    if (excluded.has(id)) continue;
    excluded.add(id);
    for (const child of byParent.get(id) ?? []) {
      queue.push(child.id);
    }
  }
  return excluded;
}

export async function getExcludedFolderIds(db: DbOrTx, areaId?: string): Promise<Set<string>> {
  const rows = areaId
    ? await db
        .select({ id: folders.id, parentId: folders.parentId, aiExcluded: folders.aiExcluded })
        .from(folders)
        .where(and(eq(folders.areaId, areaId), isNull(folders.deletedAt)))
    : await db
        .select({ id: folders.id, parentId: folders.parentId, aiExcluded: folders.aiExcluded })
        .from(folders)
        .where(isNull(folders.deletedAt));
  return collectExcludedFolderIds(rows);
}

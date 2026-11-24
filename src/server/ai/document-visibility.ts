import { and, eq, inArray, isNull, ne, notInArray, or } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import { areas, documents, noteDocumentMap } from '@/db/schema';
import { getExcludedFolderIds } from '../queries/folders';

export async function visibleDocumentConditions(db: DbOrTx) {
  const excludedFolders = [...await getExcludedFolderIds(db)];
  return [
    eq(areas.aiExcluded, false),
    eq(documents.aiExcluded, false),
    isNull(documents.deletedAt),
    ne(documents.docRole, 'instruction'),
    ...(excludedFolders.length ? [or(isNull(documents.folderId), notInArray(documents.folderId, excludedFolders))] : []),
  ];
}

/** Missing and deleted references are hidden too. This query reads metadata only. */
export async function hiddenDocumentIds(db: DbOrTx, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const visible = await db.select({ id: documents.id }).from(documents)
    .innerJoin(areas, eq(areas.id, documents.areaId))
    .where(and(inArray(documents.id, [...new Set(ids)]), ...await visibleDocumentConditions(db)));
  const allowed = new Set(visible.map((doc) => doc.id));
  return new Set(ids.filter((id) => !allowed.has(id)));
}

export async function hiddenMigratedNoteIds(db: DbOrTx, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const mappings = await db.select().from(noteDocumentMap).where(inArray(noteDocumentMap.noteId, [...new Set(ids)]));
  const hidden = await hiddenDocumentIds(db, mappings.map((row) => row.documentId));
  return new Set(mappings.filter((row) => hidden.has(row.documentId)).map((row) => row.noteId));
}

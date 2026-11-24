'use server';

import type { DocRole } from '@/db/enums';
import type { DocumentRow, DocumentVersionRow } from '@/db/schema';
import { NotFoundError, ValidationError } from '@/server/errors';
import {
  getDocument,
  listDocumentVersions,
  searchDocuments,
  type DocumentSearchHit,
} from '@/server/queries/documents';
import { DocumentId, DocumentVersionId, FolderId } from '@/server/schemas';
import { documentService } from '@/server/services/documents';
import { runAction, type ActionResult } from './result';

const manual = { origin: 'manual' } as const;
const undo = { origin: 'undo' } as const;

function parseUuid(schema: typeof DocumentId | typeof DocumentVersionId, value: string): string {
  const res = schema.safeParse(value);
  if (!res.success) throw new ValidationError(res.error.issues[0]?.message ?? 'ID không hợp lệ.');
  return res.data;
}

export async function createDocumentAction(input: unknown): Promise<ActionResult<DocumentRow>> {
  return runAction(async (db) => documentService.create(db, input as never, manual));
}

export async function renameDocumentAction(id: string, title: string): Promise<ActionResult<DocumentRow>> {
  return runAction(async (db) => documentService.rename(db, parseUuid(DocumentId, id), title, manual));
}

export async function moveDocumentAction(id: string, folderId: string | null): Promise<ActionResult<DocumentRow>> {
  return runAction(async (db) =>
    documentService.move(
      db,
      parseUuid(DocumentId, id),
      folderId === null ? null : parseUuid(FolderId, folderId),
      manual,
    ),
  );
}

export async function setDocumentRoleAction(id: string, docRole: DocRole): Promise<ActionResult<DocumentRow>> {
  return runAction(async (db) => documentService.setRole(db, parseUuid(DocumentId, id), docRole, manual));
}

export async function updateDocumentBodyAction(
  id: string,
  bodyMd: string,
  expectedRevision: number,
): Promise<ActionResult<DocumentRow>> {
  return runAction(async (db) =>
    documentService.updateBody(db, parseUuid(DocumentId, id), bodyMd, expectedRevision, manual),
  );
}

export async function setDocumentAiExcludedAction(id: string, aiExcluded: boolean): Promise<ActionResult<DocumentRow>> {
  return runAction(async (db) => {
    if (typeof aiExcluded !== 'boolean') throw new ValidationError('Giá trị không hợp lệ.');
    return documentService.setAiExcluded(db, parseUuid(DocumentId, id), aiExcluded, manual);
  });
}

export async function reorderDocumentsAction(areaId: string, orderedIds: string[]): Promise<ActionResult> {
  return runAction(async (db) => {
    await documentService.reorder(db, areaId, orderedIds, manual);
    return undefined;
  });
}

export async function softDeleteDocumentAction(id: string): Promise<ActionResult> {
  return runAction(async (db) => {
    await documentService.softDelete(db, parseUuid(DocumentId, id), manual);
    return undefined;
  });
}

export async function restoreDocumentAction(id: string): Promise<ActionResult<DocumentRow>> {
  return runAction(async (db) => documentService.restore(db, parseUuid(DocumentId, id), manual));
}

export async function restoreDocumentVersionAction(
  documentId: string,
  versionId: string,
): Promise<ActionResult<DocumentRow>> {
  return runAction(async (db) =>
    documentService.restoreVersion(
      db,
      parseUuid(DocumentId, documentId),
      parseUuid(DocumentVersionId, versionId),
      undo,
    ),
  );
}

export async function getDocumentAction(id: string): Promise<ActionResult<DocumentRow>> {
  return runAction(async (db) => {
    const doc = await getDocument(db, parseUuid(DocumentId, id));
    if (!doc) throw new NotFoundError('Không tìm thấy tài liệu.');
    return doc;
  }, []);
}

export async function listDocumentVersionsAction(documentId: string): Promise<ActionResult<DocumentVersionRow[]>> {
  return runAction(async (db) => listDocumentVersions(db, parseUuid(DocumentId, documentId)), []);
}

export async function searchDocumentsAction(
  query: string,
  areaId?: string,
): Promise<ActionResult<DocumentSearchHit[]>> {
  return runAction(async (db) => searchDocuments(db, { query, areaId }), []);
}

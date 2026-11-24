import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import type { AreaKind, DocRole } from '@/db/enums';
import { areas, documentVersions, documents, type DocumentRow, type DocumentVersionRow } from '@/db/schema';
import { normalizeVi } from '../ai/match-areas';
import { getExcludedFolderIds } from './folders';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DocumentSearchHit = {
  id: string;
  areaId: string;
  folderId: string | null;
  areaName: string;
  areaKind: AreaKind;
  title: string;
  docRole: DocRole;
  fileExt: string;
  mimeType: string;
  snippet: string;
  updatedAt: string;
};

export async function listDocuments(db: DbOrTx, areaId: string): Promise<DocumentRow[]> {
  if (!UUID.test(areaId)) return [];
  return db
    .select()
    .from(documents)
    .where(and(eq(documents.areaId, areaId), isNull(documents.deletedAt)))
    .orderBy(asc(documents.sortOrder), asc(documents.createdAt));
}

export async function getDocument(db: DbOrTx, id: string): Promise<DocumentRow | null> {
  if (!UUID.test(id)) return null;
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), isNull(documents.deletedAt)));
  return doc ?? null;
}

export async function listDocumentVersions(db: DbOrTx, documentId: string): Promise<DocumentVersionRow[]> {
  if (!UUID.test(documentId)) return [];
  return db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(desc(documentVersions.revision), desc(documentVersions.createdAt));
}

function makeSnippet(bodyMd: string, tokens: string[]): string {
  const flat = bodyMd.replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  const norm = normalizeVi(flat);
  let pos = -1;
  for (const tok of tokens) {
    const idx = norm.indexOf(tok);
    if (idx >= 0) {
      pos = idx;
      break;
    }
  }
  if (pos < 0) return flat.length > 140 ? `${flat.slice(0, 140)}…` : flat;
  // Approximate center in original string (diacritics in NFC are near-1:1 in length with NFD-stripped).
  const start = Math.max(0, pos - 40);
  const end = Math.min(flat.length, start + 140);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
}

export async function searchDocuments(
  db: DbOrTx,
  opts: { query: string; areaId?: string; limit?: number; excludeAiPrivate?: boolean },
): Promise<DocumentSearchHit[]> {
  const norm = normalizeVi(opts.query);
  if (!norm) return [];
  const tokens = norm.split(' ').filter(Boolean);
  if (tokens.length === 0) return [];
  if (opts.areaId && !UUID.test(opts.areaId)) return [];

  const tsq = tokens.map((t) => `${t}:*`).join(' & ');
  const tsExpr = sql`to_tsquery('simple', ${tsq})`;
  const conditions = [isNull(documents.deletedAt), sql`${documents.searchTsv} @@ ${tsExpr}`];
  if (opts.areaId) {
    conditions.push(eq(documents.areaId, opts.areaId));
  } else {
    conditions.push(isNull(areas.archivedAt));
  }
  if (opts.excludeAiPrivate) {
    conditions.push(eq(areas.aiExcluded, false), eq(documents.aiExcluded, false));
  }

  const excludedFolders = opts.excludeAiPrivate ? await getExcludedFolderIds(db, opts.areaId) : null;

  const rows = await db
    .select({
      id: documents.id,
      areaId: documents.areaId,
      folderId: documents.folderId,
      areaName: areas.name,
      areaKind: areas.kind,
      title: documents.title,
      docRole: documents.docRole,
      fileExt: documents.fileExt,
      mimeType: documents.mimeType,
      bodyMd: documents.bodyMd,
      extractedText: documents.extractedText,
      updatedAt: documents.updatedAt,
    })
    .from(documents)
    .innerJoin(areas, eq(areas.id, documents.areaId))
    .where(and(...conditions))
    .orderBy(sql`ts_rank_cd(${documents.searchTsv}, ${tsExpr}) desc`, desc(documents.updatedAt))
    .limit(opts.limit ?? 20);

  return rows
    .filter((r) => !(excludedFolders && r.folderId && excludedFolders.has(r.folderId)))
    .map((r) => ({
      id: r.id,
      areaId: r.areaId,
      folderId: r.folderId,
      areaName: r.areaName,
      areaKind: r.areaKind,
      title: r.title,
      docRole: r.docRole,
      fileExt: r.fileExt,
      mimeType: r.mimeType,
      snippet: makeSnippet(r.bodyMd || r.extractedText, tokens),
      updatedAt: r.updatedAt.toISOString(),
    }));
}

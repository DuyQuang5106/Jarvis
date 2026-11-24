import type { DbOrTx } from '@/db/client';
import type { DocRole } from '@/db/enums';
import type { DocumentRow } from '@/db/schema';
import { MAX_DOCUMENT_CHARS } from '@/server/schemas';
import type { WriteMeta } from '@/server/services/activity';
import { documentService } from '@/server/services/documents';
import type { FileStorage } from '@/server/storage';
import { extractTextFromBuffer } from './extract-text';
import { classifyUploadedFile } from './policy';

export type IngestFileInput = {
  areaId: string;
  folderId?: string | null;
  docRole?: DocRole;
  filename: string;
  titleOverride?: string;
  mimeType?: string;
  bytes: Uint8Array;
  aiExcluded?: boolean;
};

/**
 * Validates, extracts searchable text, persists binary bytes (when applicable) to `FileStorage`,
 * and creates the matching `documents` row without leaving orphan storage blobs on failure.
 */
export async function ingestUploadedFile(
  db: DbOrTx,
  storage: FileStorage,
  input: IngestFileInput,
  meta: WriteMeta,
  opts?: { now?: Date; touchArea?: boolean },
): Promise<DocumentRow> {
  const classified = classifyUploadedFile({
    filename: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.bytes.byteLength,
  });
  const title = (input.titleOverride?.trim() || classified.title).slice(0, 200);
  const extracted = await extractTextFromBuffer(input.bytes, classified.ext);

  if (classified.kind === 'text') {
    const bodyMd = extracted.length > MAX_DOCUMENT_CHARS ? extracted.slice(0, MAX_DOCUMENT_CHARS) : extracted;
    return documentService.create(
      db,
      {
        areaId: input.areaId,
        folderId: input.folderId ?? null,
        title,
        bodyMd,
        docRole: input.docRole ?? (classified.ext === 'md' ? 'context' : 'raw'),
        mimeType: classified.mimeType,
        fileExt: classified.ext,
        storageKey: null,
        sizeBytes: input.bytes.byteLength,
        extractedText: extracted,
        aiExcluded: input.aiExcluded ?? false,
      },
      meta,
      opts,
    );
  }

  const storageKey = `${input.areaId}/${crypto.randomUUID()}.${classified.ext}`;
  await storage.put(storageKey, input.bytes, classified.mimeType);
  try {
    return await documentService.create(
      db,
      {
        areaId: input.areaId,
        folderId: input.folderId ?? null,
        title,
        bodyMd: '',
        docRole: input.docRole ?? 'raw',
        mimeType: classified.mimeType,
        fileExt: classified.ext,
        storageKey,
        sizeBytes: input.bytes.byteLength,
        extractedText: extracted,
        aiExcluded: input.aiExcluded ?? false,
      },
      meta,
      opts,
    );
  } catch (err) {
    await storage.delete(storageKey).catch(() => {});
    throw err;
  }
}

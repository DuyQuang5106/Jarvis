'use server';

import type { FolderRow } from '@/db/schema';
import { ValidationError } from '@/server/errors';
import { FolderId } from '@/server/schemas';
import { folderService } from '@/server/services/folders';
import { runAction, type ActionResult } from './result';

const manual = { origin: 'manual' } as const;

function parseFolderId(value: string): string {
  const res = FolderId.safeParse(value);
  if (!res.success) throw new ValidationError(res.error.issues[0]?.message ?? 'Thư mục không hợp lệ.');
  return res.data;
}

export async function createFolderAction(input: unknown): Promise<ActionResult<FolderRow>> {
  return runAction(async (db) => folderService.create(db, input as never, manual));
}

export async function renameFolderAction(id: string, name: string): Promise<ActionResult<FolderRow>> {
  return runAction(async (db) => folderService.rename(db, parseFolderId(id), name, manual));
}

export async function moveFolderAction(id: string, parentId: string | null): Promise<ActionResult<FolderRow>> {
  return runAction(async (db) =>
    folderService.move(db, parseFolderId(id), parentId === null ? null : parseFolderId(parentId), manual),
  );
}

export async function setFolderAiExcludedAction(id: string, aiExcluded: boolean): Promise<ActionResult<FolderRow>> {
  return runAction(async (db) => {
    if (typeof aiExcluded !== 'boolean') throw new ValidationError('Giá trị không hợp lệ.');
    return folderService.setAiExcluded(db, parseFolderId(id), aiExcluded, manual);
  });
}

export async function reorderFoldersAction(
  areaId: string,
  parentId: string | null,
  orderedIds: string[],
): Promise<ActionResult> {
  return runAction(async (db) => {
    await folderService.reorder(db, areaId, parentId, orderedIds, manual);
    return undefined;
  });
}

export async function softDeleteFolderAction(id: string): Promise<ActionResult<FolderRow>> {
  return runAction(async (db) => folderService.softDelete(db, parseFolderId(id), manual));
}

export async function restoreFolderAction(id: string): Promise<ActionResult<FolderRow>> {
  return runAction(async (db) => folderService.restore(db, parseFolderId(id), manual));
}

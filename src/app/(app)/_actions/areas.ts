'use server';

import { addProgressLog, archiveArea, createArea, unarchiveArea, updateArea } from '@/server/services/areas';
import type { CreateAreaInput, UpdateAreaInput } from '@/server/schemas';
import { runAction, type ActionResult } from './result';

const manual = { origin: 'manual' } as const;

export async function createAreaAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async (db) => {
    const row = await createArea(db, input as CreateAreaInput, manual);
    return { id: row.id };
  });
}

export async function updateAreaAction(id: string, patch: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async (db) => {
    const row = await updateArea(db, id, patch as UpdateAreaInput, manual);
    return { id: row.id };
  });
}

export async function archiveAreaAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async (db) => {
    await archiveArea(db, id, manual);
    return { id };
  });
}

export async function unarchiveAreaAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async (db) => {
    await unarchiveArea(db, id, manual);
    return { id };
  });
}

export async function addProgressLogAction(areaId: string, text: string): Promise<ActionResult> {
  return runAction(async (db) => {
    await addProgressLog(db, areaId, text, manual);
    return undefined;
  });
}

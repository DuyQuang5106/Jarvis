'use server';

import { getDb } from '@/db/client';
import type { SettingsRow } from '@/db/schema';
import { requireOwner } from '@/server/auth';
import type { UpdateSettingsInput } from '@/server/schemas';
import { getSettings, updateSettings } from '@/server/services/settings';
import { runAction, type ActionResult } from './result';

/** Read for the Settings dialog: the frame is static, so settings are fetched here behind the owner check. */
export async function getSettingsAction(): Promise<ActionResult<SettingsRow>> {
  await requireOwner();
  try {
    return { ok: true, data: await getSettings(await getDb()) };
  } catch {
    return { ok: false, error: 'Có lỗi xảy ra, thử lại.' };
  }
}

export async function updateSettingsAction(patch: unknown): Promise<ActionResult<SettingsRow>> {
  return runAction((db) => updateSettings(db, patch as UpdateSettingsInput), ['/context', '/chat']);
}

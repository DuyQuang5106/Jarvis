import { revalidatePath } from 'next/cache';
import { getDb, type Db } from '@/db/client';
import { NotFoundError, ValidationError } from '@/server/errors';
import { requireOwner } from '@/server/auth';

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const GENERIC_ERROR = 'Có lỗi xảy ra, thử lại.';

/**
 * Shared wrapper of every server action: owner check -> db -> callback -> revalidate.
 * Expected errors become a result; Next's redirect error from requireOwner() propagates.
 */
export async function runAction<T>(
  fn: (db: Db) => Promise<T>,
  paths: string[] = ['/context'],
): Promise<ActionResult<T>> {
  await requireOwner();
  try {
    const db = await getDb();
    const data = await fn(db);
    for (const p of paths) revalidatePath(p);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ValidationError || err instanceof NotFoundError) return { ok: false, error: err.message };
    console.error('Server action failed:', err instanceof Error ? err.name : 'UnknownError');
    return { ok: false, error: GENERIC_ERROR };
  }
}

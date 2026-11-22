import { sql } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import { aiUsage } from '@/db/schema';
import { AiCapExceededError } from '../errors';

/** Atomically counts one AI request for `today`; throws without counting when `cap` is reached. */
export async function countAiRequest(db: DbOrTx, today: string, cap: number): Promise<number> {
  if (cap < 1) throw new AiCapExceededError();
  const rows = await db
    .insert(aiUsage)
    .values({ day: today, count: 1 })
    .onConflictDoUpdate({
      target: aiUsage.day,
      set: { count: sql`${aiUsage.count} + 1` },
      setWhere: sql`${aiUsage.count} < ${cap}`,
    })
    .returning({ count: aiUsage.count });
  if (rows.length === 0) throw new AiCapExceededError();
  return rows[0].count;
}

import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import { topics } from '@/db/schema';
import { NotFoundError } from '../errors';
import { recordChange, touchArea, type WriteMeta } from './activity';

/**
 * Moves a topic one place up or down inside its area, in one transaction. The area's topics are
 * renumbered to 0..n-1 in their current order (so ties are normalized), the topic is swapped with
 * its neighbour (no-op at the ends), and only rows whose `sortOrder` changed are written, each with
 * one `update` log sharing a batchId.
 */
export async function moveTopic(
  db: DbOrTx,
  topicId: string,
  direction: 'up' | 'down',
  meta: WriteMeta,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [target] = await tx.select().from(topics).where(eq(topics.id, topicId));
    if (!target) throw new NotFoundError();
    const rows = await tx
      .select()
      .from(topics)
      .where(eq(topics.areaId, target.areaId))
      .orderBy(asc(topics.sortOrder), asc(topics.createdAt), asc(topics.id));

    const index = rows.findIndex((r) => r.id === topicId);
    const other = direction === 'up' ? index - 1 : index + 1;
    const order = rows.map((r) => r.id);
    if (other >= 0 && other < rows.length) [order[index], order[other]] = [order[other], order[index]];

    const batchId = meta.batchId ?? randomUUID();
    const now = new Date();
    let changed = false;
    for (const [position, id] of order.entries()) {
      const before = rows.find((r) => r.id === id)!;
      if (before.sortOrder === position) continue;
      const [after] = await tx
        .update(topics)
        .set({ sortOrder: position, updatedAt: now })
        .where(eq(topics.id, id))
        .returning();
      await recordChange(tx, {
        areaId: target.areaId,
        entityType: 'topic',
        entityId: id,
        action: 'update',
        before,
        after,
        ...meta,
        batchId,
      });
      changed = true;
    }
    if (changed) await touchArea(tx, target.areaId, now);
  });
}

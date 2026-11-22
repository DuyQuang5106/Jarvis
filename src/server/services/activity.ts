import { eq } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import type { EntityType, LogAction, Origin } from '@/db/enums';
import { activityLogs, areas } from '@/db/schema';

export type WriteMeta = { origin: Origin; batchId?: string };

export type ChangeEvent = {
  areaId: string | null;
  entityType: EntityType;
  entityId: string;
  action: LogAction;
  before?: unknown;
  after?: unknown;
} & WriteMeta;

/** Appends one activity_logs row. Call it inside the same transaction as the write it describes. */
export async function recordChange(tx: DbOrTx, e: ChangeEvent): Promise<void> {
  await tx.insert(activityLogs).values({
    areaId: e.areaId,
    entityType: e.entityType,
    entityId: e.entityId,
    action: e.action,
    beforeJson: e.before ?? null,
    afterJson: e.after ?? null,
    origin: e.origin,
    batchId: e.batchId ?? null,
  });
}

/** areas.updated_at doubles as "last updated" for the area and all of its children. */
export async function touchArea(tx: DbOrTx, areaId: string, at: Date): Promise<void> {
  await tx.update(areas).set({ updatedAt: at }).where(eq(areas.id, areaId));
}

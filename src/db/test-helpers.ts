import { asc, eq } from 'drizzle-orm';
import type { Db } from './client';
import { activityLogs, areas, type ActivityLogRow, type AreaRow } from './schema';

export async function makeArea(db: Db, overrides: Partial<typeof areas.$inferInsert> = {}): Promise<AreaRow> {
  const [row] = await db
    .insert(areas)
    .values({ kind: 'academic', name: 'Mobile Programming', status: 'active', ...overrides })
    .returning();
  return row;
}

export function logsFor(db: Db, entityId: string): Promise<ActivityLogRow[]> {
  return db
    .select()
    .from(activityLogs)
    .where(eq(activityLogs.entityId, entityId))
    .orderBy(asc(activityLogs.createdAt), asc(activityLogs.id));
}

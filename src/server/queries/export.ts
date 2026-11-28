import type { PgTable } from 'drizzle-orm/pg-core';
import type { DbOrTx } from '@/db/client';
import { TABLES } from '@/db/schema';

export type ExportData = { schema_version: 3; exported_at: string; tables: Record<string, unknown[]> };

/** Device push endpoints and keys: secrets tied to one browser, useless in a backup and unsafe in a file. */
const NOT_EXPORTED = new Set(['push_subscriptions']);

/** Dumps every table in TABLES (so a table added later cannot be missed). Rows keep Drizzle's property names. */
export async function buildExport(db: DbOrTx, now: Date): Promise<ExportData> {
  const tables: Record<string, unknown[]> = {};
  for (const [name, table] of Object.entries(TABLES)) {
    if (NOT_EXPORTED.has(name)) continue;
    tables[name] = await db.select().from(table as PgTable);
  }
  return { schema_version: 3, exported_at: now.toISOString(), tables };
}

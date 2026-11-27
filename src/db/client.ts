import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getConfig } from '@/server/config';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

export const MIGRATIONS_FOLDER = path.join(process.cwd(), 'drizzle');

async function createDb(): Promise<Db> {
  const cfg = getConfig();
  if (cfg.dbDriver === 'postgres') {
    if (!cfg.databaseUrl) throw new Error('DATABASE_URL is required when DB_DRIVER=postgres');
    // Supabase's *session* pooler (port 5432). postgres-js pipelines queries on a connection, and the
    // transaction pooler (6543) stalls on pipelined queries: measured 147 of 150 parallel reads hung there,
    // 0 on the session pooler. Few connections per instance, closed when idle, so instances that come and go
    // do not use up the session pool.
    return drizzlePostgres(postgres(cfg.databaseUrl, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10 }), { schema });
  }
  const client = new PGlite(cfg.pgliteDir === 'memory' ? undefined : cfg.pgliteDir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

const globalForDb = globalThis as unknown as { __jarvisDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  globalForDb.__jarvisDb ??= createDb().catch((err) => {
    globalForDb.__jarvisDb = undefined;
    throw err;
  });
  return globalForDb.__jarvisDb;
}

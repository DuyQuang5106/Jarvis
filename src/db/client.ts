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
    return drizzlePostgres(postgres(cfg.databaseUrl, { prepare: false }), { schema });
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

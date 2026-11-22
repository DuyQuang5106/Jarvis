import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

export const MIGRATIONS_FOLDER = path.join(process.cwd(), 'drizzle');

// Single place that reads DB env vars (Task 3 replaces this with getConfig()).
function readDbEnv() {
  const env = process.env;
  const driver = env.DB_DRIVER ?? (env.NODE_ENV === 'production' ? 'postgres' : 'pglite');
  return {
    driver,
    databaseUrl: env.DATABASE_URL,
    pgliteDir: env.PGLITE_DIR || './.pglite',
  };
}

async function createDb(): Promise<Db> {
  const cfg = readDbEnv();
  if (cfg.driver === 'postgres') {
    if (!cfg.databaseUrl) throw new Error('DATABASE_URL is required when DB_DRIVER=postgres');
    return drizzlePostgres(postgres(cfg.databaseUrl, { prepare: false }), { schema });
  }
  if (cfg.driver !== 'pglite') throw new Error(`Unknown DB_DRIVER: ${cfg.driver}`);
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

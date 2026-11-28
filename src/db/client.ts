import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { attachDatabasePool } from '@vercel/functions';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { getConfig } from '@/server/config';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

/**
 * The connection string the app runs on: a Supabase pooler address given with the session port (5432, the one
 * migrations use) is switched to the transaction port (6543), so either value of DATABASE_URL works.
 */
export function runtimeUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('.pooler.supabase.com') && (u.port === '5432' || u.port === '')) u.port = '6543';
    return u.toString();
  } catch {
    return url;
  }
}

export const MIGRATIONS_FOLDER = path.join(process.cwd(), 'drizzle');

async function createDb(): Promise<Db> {
  const cfg = getConfig();
  if (cfg.dbDriver === 'postgres') {
    if (!cfg.databaseUrl) throw new Error('DATABASE_URL is required when DB_DRIVER=postgres');
    // node-postgres over Supabase's *transaction* pooler (port 6543), not postgres-js over the session pooler:
    // - postgres-js pipelines queries, and the transaction pooler stalls on that (147 of 150 parallel reads hung);
    //   pg sends one query per connection at a time (150 of 150 in 2.4 s there);
    // - the session pooler allows 15 clients, and Vercel instances that go to sleep keep theirs: on 28/11/2026 it
    //   ran full and every query failed. The transaction pooler allows far more, and attachDatabasePool lets
    //   Vercel close idle connections before an instance is suspended.
    const pool = new Pool({ connectionString: runtimeUrl(cfg.databaseUrl), max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 });
    attachDatabasePool(pool);
    return drizzleNodePg(pool, { schema }) as unknown as Db;
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

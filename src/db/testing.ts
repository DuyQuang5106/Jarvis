import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { MIGRATIONS_FOLDER, type Db } from './client';
import * as schema from './schema';

/** Fresh in-memory PGlite, migrated from the same `drizzle/` folder production uses. */
export async function createTestDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

/** `db.execute` returns `{ rows }` on PGlite and an array on postgres.js. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowsOf(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  return (result as { rows: unknown[] }).rows;
}

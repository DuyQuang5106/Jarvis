import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, onTestFinished } from 'vitest';
import { MIGRATIONS_FOLDER, type Db } from './client';
import * as schema from './schema';

// Migrating a PGlite costs about a second, so it happens once per test module: every createTestDb()
// clones this migrated template instead of migrating a new instance.
let template: Promise<PGlite> | undefined;

function getTemplate(): Promise<PGlite> {
  template ??= (async () => {
    const pg = new PGlite();
    await migrate(drizzle(pg, { schema }), { migrationsFolder: MIGRATIONS_FOLDER });
    return pg;
  })().catch((err) => {
    template = undefined;
    throw err;
  });
  return template;
}

// Clones made outside a running test (e.g. in beforeAll) live until the end of the file.
const openOutsideTests = new Set<PGlite>();

afterAll(async () => {
  const clones = [...openOutsideTests];
  openOutsideTests.clear();
  const tpl = template;
  template = undefined;
  await Promise.all(clones.map((c) => c.close()));
  if (tpl) await (await tpl.catch(() => null))?.close();
});

/**
 * Fresh in-memory PGlite, migrated from the same `drizzle/` folder production uses.
 * It is closed when the current test finishes (or at the end of the file when created outside a test).
 */
export async function createTestDb(): Promise<Db> {
  const client = (await (await getTemplate()).clone()) as PGlite;
  try {
    onTestFinished(() => client.close());
  } catch {
    openOutsideTests.add(client);
  }
  return drizzle(client, { schema });
}

/** `db.execute` returns `{ rows }` on PGlite and an array on postgres.js. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowsOf(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  return (result as { rows: unknown[] }).rows;
}

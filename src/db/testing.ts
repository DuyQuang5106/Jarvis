import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, onTestFinished } from 'vitest';
import { MIGRATIONS_FOLDER, type Db } from './client';
import * as schema from './schema';

// Migrating a PGlite costs about a second, so it happens once per test module: the migrated data dir is
// dumped once, the template instance is closed (it would hold its memory for the whole file), and every
// createTestDb() starts a new instance from that dump. `pg.clone()` would re-dump the template each time.
let templateDump: Promise<Blob> | undefined;

function getTemplateDump(): Promise<Blob> {
  templateDump ??= (async () => {
    const pg = new PGlite();
    try {
      await migrate(drizzle(pg, { schema }), { migrationsFolder: MIGRATIONS_FOLDER });
      return await pg.dumpDataDir('none');
    } finally {
      await pg.close();
    }
  })().catch((err) => {
    templateDump = undefined;
    throw err;
  });
  return templateDump;
}

// Clones made outside a running test (e.g. in beforeAll) live until the end of the file.
const openOutsideTests = new Set<PGlite>();

afterAll(async () => {
  const clones = [...openOutsideTests];
  openOutsideTests.clear();
  templateDump = undefined;
  await Promise.all(clones.map((c) => c.close()));
});

/**
 * Fresh in-memory PGlite, migrated from the same `drizzle/` folder production uses.
 * It is closed when the current test finishes (or at the end of the file when created outside a test).
 */
export async function createTestDb(): Promise<Db> {
  const client = await PGlite.create({ loadDataDir: await getTemplateDump() });
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

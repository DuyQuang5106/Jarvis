import { TABLE_NAMES } from '@/db/schema';

/** The few calls the transfer needs, so PGlite (source, tests) and postgres-js (Supabase) both fit. */
export type Queryable = { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> };

export type TableCount = { table: string; rows: number };

const ROWS_PER_BATCH = 200;
const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** Foreign keys between app tables, as `table → referenced table` (self references included). */
async function foreignKeys(db: Queryable): Promise<{ table: string; references: string; column: string }[]> {
  return db.query(
    `select c.conrelid::regclass::text as "table", c.confrelid::regclass::text as "references", a.attname as "column"
       from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f' and c.connamespace = 'public'::regnamespace`,
  );
}

/** App tables ordered so every referenced table comes before the tables that point at it. */
export async function insertOrder(db: Queryable): Promise<string[]> {
  const fks = await foreignKeys(db);
  const order: string[] = [];
  const visiting = new Set<string>();
  const visit = (table: string) => {
    if (order.includes(table) || visiting.has(table)) return;
    visiting.add(table);
    for (const fk of fks) if (fk.table === table && fk.references !== table) visit(fk.references);
    visiting.delete(table);
    order.push(table);
  };
  for (const table of TABLE_NAMES) visit(table);
  return order.filter((table) => TABLE_NAMES.includes(table));
}

/** Columns that can be written (generated columns such as search vectors are rebuilt by the target). */
async function writableColumns(db: Queryable, table: string): Promise<string[]> {
  const rows = await db.query<{ column_name: string }>(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = $1 and is_generated = 'NEVER' order by ordinal_position`,
    [table],
  );
  return rows.map((r) => r.column_name);
}

export async function countRows(db: Queryable): Promise<TableCount[]> {
  const out: TableCount[] = [];
  for (const table of TABLE_NAMES) {
    const [row] = await db.query<{ n: number | string }>(`select count(*) as n from ${quote(table)}`);
    out.push({ table, rows: Number(row.n) });
  }
  return out;
}

/**
 * Rows of a table that points at itself (folders → parent folder), parents first. Rows whose parent never
 * shows up keep their place at the end; the target's foreign key then refuses them, which is the right outcome.
 */
function parentsFirst(rows: Record<string, unknown>[], column: string): Record<string, unknown>[] {
  const done = new Set<unknown>();
  const out: Record<string, unknown>[] = [];
  let left = rows;
  while (left.length > 0) {
    const ready = left.filter((r) => r[column] === null || r[column] === undefined || done.has(r[column]));
    if (ready.length === 0) return [...out, ...left];
    for (const r of ready) {
      out.push(r);
      done.add(r.id);
    }
    left = left.filter((r) => !ready.includes(r));
  }
  return out;
}

/**
 * Copies every app table from `source` to `target` in one transaction. The target must be migrated to the
 * same schema and empty. Returns the row counts read from the target afterwards.
 */
export async function transferDatabase(source: Queryable, target: Queryable, log: (line: string) => void = () => {}): Promise<TableCount[]> {
  const notEmpty = (await countRows(target)).filter((c) => c.rows > 0);
  if (notEmpty.length > 0) {
    throw new Error(`Database đích đã có dữ liệu (${notEmpty.map((c) => `${c.table}: ${c.rows}`).join(', ')}). Chỉ chuyển vào database trống.`);
  }
  const order = await insertOrder(source);
  const selfRefs = (await foreignKeys(source)).filter((fk) => fk.table === fk.references);
  await target.query('begin');
  try {
    for (const table of order) {
      const columns = await writableColumns(target, table);
      const list = columns.map(quote).join(', ');
      let rows = (await source.query<{ row: Record<string, unknown> }>(`select row_to_json(t) as row from ${quote(table)} t`)).map((r) => r.row);
      const self = selfRefs.find((fk) => fk.table === table);
      if (self) rows = parentsFirst(rows, self.column);
      for (let i = 0; i < rows.length; i += ROWS_PER_BATCH) {
        const batch = rows.slice(i, i + ROWS_PER_BATCH);
        await target.query(
          `insert into ${quote(table)} (${list}) select ${list} from json_populate_recordset(null::${quote(table)}, $1::text::json)`,
          [JSON.stringify(batch)],
        );
      }
      log(`${table}: ${rows.length} dòng`);
    }
    await target.query('commit');
  } catch (err) {
    await target.query('rollback');
    throw err;
  }
  const after = await countRows(target);
  const before = await countRows(source);
  const mismatched = before.filter((b) => after.find((a) => a.table === b.table)?.rows !== b.rows);
  if (mismatched.length > 0) throw new Error(`Số dòng lệch sau khi chuyển: ${mismatched.map((m) => m.table).join(', ')}.`);
  return after;
}

/** Storage keys of uploaded files (`<areaId>/<docId>.ext`), for copying the files themselves. */
export async function storageKeys(db: Queryable): Promise<{ key: string; fileExt: string | null }[]> {
  return db.query(`select storage_key as key, file_ext as "fileExt" from documents where storage_key is not null order by storage_key`);
}

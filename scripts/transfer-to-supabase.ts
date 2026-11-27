/**
 * Moves the local workspace (a COPY of the PGlite folder + `.storage` files) to Supabase.
 *
 *   pnpm transfer:supabase --from <copy of .pglite> [--dry-run] [--skip-files] [--files-only]
 *
 * Reads secrets from `.env.production.local`: MIGRATION_DATABASE_URL (or DATABASE_URL),
 * NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET, optional STORAGE_DIR.
 * The target must already be migrated (`pnpm db:migrate`) and empty. Never prints secrets.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { countRows, storageKeys, transferDatabase, type Queryable } from '../src/server/migration/transfer';

const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  txt: 'text/plain',
  md: 'text/markdown',
};

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(name);

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return '(không đọc được)';
  }
};

async function main() {
  try {
    process.loadEnvFile('.env.production.local');
  } catch {
    fail('Không thấy .env.production.local. Tạo file đó theo docs/deploy.md rồi chạy lại.');
  }
  const from = arg('--from');
  if (!from) fail('Thiếu --from <thư mục>: trỏ tới BẢN SAO của .pglite (dừng `pnpm dev`, sao chép .pglite ra chỗ khác, xóa postmaster.pid trong bản sao).');
  if (path.resolve(from) === path.resolve('.pglite')) fail('--from đang trỏ thẳng vào .pglite. Hãy sao chép nó ra thư mục khác rồi trỏ tới bản sao.');
  if (!existsSync(from)) fail(`Không thấy thư mục ${from}.`);
  const dryRun = flag('--dry-run');
  const skipFiles = flag('--skip-files');
  const filesOnly = flag('--files-only');

  const dbUrl = process.env.MIGRATION_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!dbUrl && !filesOnly) fail('Thiếu MIGRATION_DATABASE_URL (hoặc DATABASE_URL) trong .env.production.local.');

  const pg = new PGlite(from);
  const source: Queryable = { query: async (sql, params) => (await pg.query(sql, params)).rows as never };

  if (!filesOnly) {
    const client = postgres(dbUrl!, { max: 1, prepare: false, onnotice: () => {} });
    const target: Queryable = { query: async (sql, params) => (await client.unsafe(sql, (params ?? []) as never[])) as never };
    try {
      console.log(`Nguồn: ${from}. Đích: ${hostOf(dbUrl!)}.`);
      const counts = await countRows(source);
      console.log(counts.filter((c) => c.rows > 0).map((c) => `  ${c.table}: ${c.rows}`).join('\n'));
      const busy = (await countRows(target)).filter((c) => c.rows > 0);
      if (busy.length > 0) fail(`Database đích đã có dữ liệu (${busy.map((c) => c.table).join(', ')}). Dừng lại, không ghi gì.`);
      if (dryRun) {
        console.log('Chạy thử: database đích trống và đã có đủ bảng. Chưa ghi gì.');
      } else {
        await transferDatabase(source, target, (line) => console.log(`  đã chép ${line}`));
        console.log('Đã chuyển database; số dòng hai bên khớp.');
      }
    } catch (err) {
      // Message only: the error object may carry the connection string.
      fail(`Chuyển database thất bại: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await client.end();
    }
  }

  if (!skipFiles) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const bucketName = process.env.SUPABASE_STORAGE_BUCKET?.trim();
    const storageDir = process.env.STORAGE_DIR?.trim() || './.storage';
    if (!url || !key || !bucketName) fail('Thiếu NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY hoặc SUPABASE_STORAGE_BUCKET.');
    const files = await storageKeys(source);
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) fail(`Không đọc được danh sách bucket (${listError.message}).`);
    if (!buckets?.some((b) => b.name === bucketName)) {
      if (dryRun) console.log(`Bucket ${bucketName} chưa có; lần chạy thật sẽ tạo (riêng tư).`);
      else {
        const { error } = await supabase.storage.createBucket(bucketName, { public: false });
        if (error) fail(`Không tạo được bucket (${error.message}).`);
      }
    }
    let copied = 0;
    let skipped = 0;
    const missing: string[] = [];
    for (const [i, file] of files.entries()) {
      const local = path.join(storageDir, ...file.key.split('/'));
      if (!existsSync(local)) {
        missing.push(file.key);
        continue;
      }
      if (dryRun) continue;
      const bucket = supabase.storage.from(bucketName);
      const dir = file.key.slice(0, file.key.lastIndexOf('/'));
      const name = file.key.slice(file.key.lastIndexOf('/') + 1);
      const { data: found } = await bucket.list(dir, { search: name, limit: 1 });
      if (found?.some((f) => f.name === name)) {
        skipped += 1;
        continue;
      }
      const bytes = await readFile(local);
      const contentType = CONTENT_TYPES[(file.fileExt ?? '').toLowerCase()] ?? 'application/octet-stream';
      const { error } = await bucket.upload(file.key, bytes, { contentType, upsert: false });
      if (error) fail(`Tải lên thất bại ở tệp ${i + 1}/${files.length} (${error.message}). Chạy lại với --files-only để tiếp tục.`);
      copied += 1;
      if (copied % 20 === 0) console.log(`  đã tải ${copied} tệp…`);
    }
    if (missing.length > 0) console.warn(`Thiếu ${missing.length} tệp trong ${storageDir}: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`);
    console.log(dryRun ? `Chạy thử: ${files.length - missing.length} tệp sẽ được tải lên.` : `Tệp: tải ${copied}, bỏ qua ${skipped} (đã có).`);
  }
  // Close PGlite and let Node exit on its own. `process.exit` right after the Supabase uploads aborts Node on
  // Windows (`Assertion failed … async.c`) while their sockets are still closing. A late timer is the backstop.
  await pg.close();
  process.exitCode = 0;
  setTimeout(() => process.exit(0), 10_000).unref();
}

main().catch((err) => fail(`Lỗi: ${err instanceof Error ? err.message : String(err)}`));

import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';

/**
 * Supabase's session pooler (5432) allows 15 clients and can be full of connections held by sleeping Vercel
 * instances (28/11/2026), which would fail the deploy before it could fix anything. One pg connection through the
 * transaction pooler (6543) runs the migrations: one statement at a time, each migration in its own transaction.
 */
function migrationUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('.pooler.supabase.com') && (u.port === '5432' || u.port === '')) u.port = '6543';
    return u.toString();
  } catch {
    return url;
  }
}

/** Host (and port) of a connection string, never the user or password. */
function hostOf(url: string): string {
  try {
    return new URL(url).host || '(không rõ host)';
  } catch {
    return '(connection string không đọc được)';
  }
}

async function main() {
  for (const file of ['.env.production.local', '.env.local']) {
    try {
      process.loadEnvFile(file);
      break;
    } catch {
      // Thử file tiếp theo.
    }
  }
  const url = process.env.MIGRATION_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error('Thiếu biến môi trường: MIGRATION_DATABASE_URL hoặc DATABASE_URL. Điền vào .env.production.local (hoặc .env.local) rồi chạy lại.');
    process.exit(1);
  }
  const target = migrationUrl(url);
  console.log(`Áp migration lên ${hostOf(target)}…`);
  const client = new Client({ connectionString: target, connectionTimeoutMillis: 15_000 });
  await client.connect();
  try {
    await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), 'drizzle') });
    console.log('Đã áp migration.');
  } finally {
    await client.end();
  }
}

function messageOf(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  // Drizzle bọc lỗi driver ("Failed query: ..."); lý do thật nằm ở `cause`.
  const cause = err.cause instanceof Error ? ` (${err.cause.message})` : '';
  return `${err.message.trim()}${cause}`;
}

main().catch((err) => {
  // Chỉ in thông báo, không in object lỗi (có thể chứa connection string).
  console.error(`Migration thất bại: ${messageOf(err)}`);
  process.exit(1);
});

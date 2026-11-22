import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

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
  console.log(`Áp migration lên ${hostOf(url)}…`);
  const client = postgres(url, { max: 1, prepare: false });
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

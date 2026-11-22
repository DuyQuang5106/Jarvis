import { getDb } from '@/db/client';
import { getConfig } from '@/server/config';
import { importSeed } from '@/server/seed/import-seed';
import { SEED_ITEMS, SEED_TERM_GOAL } from '@/server/seed/seed-data';

async function main() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Không có .env.local: dùng biến môi trường hiện tại.
  }
  const force = process.argv.includes('--force');
  const cfg = getConfig();
  if ((cfg.nodeEnv === 'production' || cfg.dbDriver === 'postgres') && !force) {
    console.error(
      `Từ chối nhập seed (NODE_ENV=${cfg.nodeEnv}, DB_DRIVER=${cfg.dbDriver}). Chạy lại với --force nếu đúng là muốn nhập vào database này.`,
    );
    process.exit(1);
  }
  const db = await getDb();
  const { created } = await importSeed(db, {
    items: SEED_ITEMS.map((s) => ({ key: s.key, name: s.name })),
    termGoal: SEED_TERM_GOAL,
    now: new Date(),
  });
  console.log(`Đã nhập ${created} mục seed.`);
  process.exit(0); // PGlite giữ tiến trình mở
}

main().catch((err) => {
  console.error(`Nhập seed thất bại: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

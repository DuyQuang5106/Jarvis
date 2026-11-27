/**
 * Vercel runs this instead of `build` (the `vercel-build` script wins): every push to `main` is checked,
 * migrated and built in one place, so a red check never reaches production.
 *
 * 1. tsc, lint, unit tests — with production secrets removed, so no test can reach the real database or AI.
 * 2. `db:migrate` — production only (`VERCEL_ENV=production`); migrations only add tables and columns, so
 *    the running version keeps working while this build finishes.
 * 3. `next build`.
 *
 * `SKIP_BUILD_CHECKS=1` skips step 1 (an emergency fix when the checks themselves are broken).
 */
import { spawnSync } from 'node:child_process';

/** Never handed to the checks: they run on mocks and in-memory PGlite only. */
const SECRETS = [
  'DATABASE_URL',
  'MIGRATION_DATABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'AI_API_KEY',
  'AI_BASE_URL',
  'AI_MODEL',
  'AI_PROVIDER',
  'AI_ACTION_MODE',
  'APP_OWNER_EMAIL',
  'STORAGE_DRIVER',
  'SUPABASE_STORAGE_BUCKET',
];

function run(title: string, command: string, env: NodeJS.ProcessEnv = process.env) {
  console.log(`\n▶ ${title}: ${command}`);
  const started = Date.now();
  const result = spawnSync(command, { stdio: 'inherit', shell: true, env });
  if (result.status !== 0) {
    console.error(`✖ ${title} thất bại (mã ${result.status}). Dừng build; bản đang chạy giữ nguyên.`);
    process.exit(result.status ?? 1);
  }
  console.log(`✔ ${title} (${Math.round((Date.now() - started) / 1000)} giây)`);
}

const checkEnv: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test' };
for (const name of SECRETS) delete checkEnv[name];

if (process.env.SKIP_BUILD_CHECKS === '1') {
  console.warn('⚠ SKIP_BUILD_CHECKS=1: bỏ qua tsc, lint và test.');
} else {
  // tsc needs the route types (`LayoutProps`, `PageProps`) that Next generates into .next/types; a fresh
  // checkout has none, so generate them first.
  run('Sinh kiểu route', 'pnpm exec next typegen', checkEnv);
  run('Kiểm tra kiểu', 'pnpm exec tsc --noEmit', checkEnv);
  run('Lint', 'pnpm lint', checkEnv);
  run('Unit test', 'pnpm test', checkEnv);
}

if (process.env.VERCEL_ENV === 'production') {
  if (!process.env.MIGRATION_DATABASE_URL && !process.env.DATABASE_URL) {
    console.error('✖ Thiếu MIGRATION_DATABASE_URL trên Vercel: không migrate được. Dừng build.');
    process.exit(1);
  }
  run('Migrate database', 'pnpm db:migrate');
} else {
  console.log(`\n• Bỏ qua migrate (VERCEL_ENV=${process.env.VERCEL_ENV ?? 'không có'}): chỉ production mới đụng database thật.`);
}

run('Build', 'pnpm exec next build');

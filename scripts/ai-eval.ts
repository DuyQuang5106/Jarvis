import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** The owner's database when `PGLITE_DIR` is unset (see `src/server/config.ts`). */
const DEFAULT_PGLITE_DIR = './.pglite';
const CASES_FILE = 'docs/ai-eval-cases.json';
const REPORT_FILE = 'docs/ai-eval-report.md';

function samePath(a: string, b: string): boolean {
  const x = path.resolve(a);
  const y = path.resolve(b);
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  // Values from the shell win over `.env.local` (AI_MODEL picks the model to evaluate).
  const shellModel = process.env.AI_MODEL?.trim();
  const shellEvalDir = process.env.EVAL_PGLITE_DIR?.trim();
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Không có .env.local: dùng biến môi trường hiện có.
  }
  if (shellModel) process.env.AI_MODEL = shellModel;

  // Chat turns write messages and pending proposals: only ever on a copy of the database.
  const evalDir = shellEvalDir || process.env.EVAL_PGLITE_DIR?.trim();
  const ownerDir = process.env.PGLITE_DIR?.trim() || DEFAULT_PGLITE_DIR;
  if (!evalDir) fail('Thiếu EVAL_PGLITE_DIR: trỏ nó tới một BẢN SAO của thư mục PGlite (vd. cp -r .pglite .pglite-eval).');
  if (evalDir === 'memory' || samePath(evalDir, DEFAULT_PGLITE_DIR) || (ownerDir !== 'memory' && samePath(evalDir, ownerDir))) {
    fail(`EVAL_PGLITE_DIR=${evalDir} là database đang dùng. Hãy sao chép nó ra thư mục khác rồi trỏ EVAL_PGLITE_DIR tới bản sao.`);
  }
  if (!existsSync(evalDir)) fail(`Không thấy thư mục ${evalDir}. Sao chép database vào đó trước.`);
  process.env.PGLITE_DIR = evalDir;
  process.env.DB_DRIVER = 'pglite';

  // Imported only now: the database client reads PGLITE_DIR from the config on first use.
  const { getDb } = await import('../src/db/client');
  const { getConfig } = await import('../src/server/config');
  const { getProvider } = await import('../src/server/ai/provider');
  const { formatEvalReport, parseEvalCases, runEval } = await import('../src/server/ai/eval');

  const cfg = getConfig();
  const model = cfg.aiProvider === 'mock' ? 'mock' : (cfg.aiModel ?? '');
  const cases = parseEvalCases(readFileSync(CASES_FILE, 'utf8'));
  console.log(`Đánh giá ${cases.length} case với model ${model} (chế độ ${cfg.aiActionMode}) trên ${evalDir}…`);

  const results = await runEval(
    { db: await getDb(), provider: getProvider(), actionMode: cfg.aiActionMode, now: new Date(), maxOutputTokens: cfg.aiMaxOutputTokens, model },
    cases,
  );
  writeFileSync(REPORT_FILE, formatEvalReport({ date: new Date().toISOString(), model, actionMode: cfg.aiActionMode, results }));

  for (const r of results) {
    console.log(`${r.pass ? 'đạt  ' : 'trượt'} ${r.id} (chữ đầu ${r.firstTokenMs} ms, tổng ${r.totalMs} ms)${r.failures.length ? `: ${r.failures.join('; ')}` : ''}`);
  }
  const failed = results.filter((r) => !r.pass).length;
  console.log(`${results.length - failed}/${results.length} case đạt. Báo cáo: ${REPORT_FILE}`);
  // PGlite keeps the event loop alive: exit explicitly.
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

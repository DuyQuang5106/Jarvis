import { TABLE_NAMES } from '../src/db/schema';

export type RlsResult = { table: string; ok: boolean; detail: string };

export async function checkRls(opts: {
  supabaseUrl: string;
  anonKey: string;
  tables: readonly string[];
  fetch?: typeof fetch;
}): Promise<RlsResult[]> {
  const doFetch = opts.fetch ?? fetch;
  const base = opts.supabaseUrl.replace(/\/+$/, '');
  const results: RlsResult[] = [];
  for (const table of opts.tables) {
    try {
      const res = await doFetch(`${base}/rest/v1/${table}?select=*&limit=1`, {
        headers: { apikey: opts.anonKey, Authorization: `Bearer ${opts.anonKey}` },
      });
      const text = await res.text();
      if (!res.ok) {
        results.push({ table, ok: true, detail: `bị từ chối (HTTP ${res.status})` });
        continue;
      }
      let rows: unknown;
      try {
        rows = JSON.parse(text);
      } catch {
        results.push({ table, ok: false, detail: `phản hồi 2xx không phải JSON (HTTP ${res.status})` });
        continue;
      }
      if (Array.isArray(rows) && rows.length === 0) {
        results.push({ table, ok: true, detail: 'không đọc được dòng nào' });
      } else {
        results.push({ table, ok: false, detail: 'anon đọc được dữ liệu' });
      }
    } catch (err) {
      results.push({ table, ok: false, detail: `lỗi mạng: ${err instanceof Error ? err.message : String(err)}` });
    }
  }
  return results;
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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const missing = [!supabaseUrl && 'NEXT_PUBLIC_SUPABASE_URL', !anonKey && 'NEXT_PUBLIC_SUPABASE_ANON_KEY'].filter(Boolean);
  if (!supabaseUrl || !anonKey) {
    console.error(`Thiếu biến môi trường: ${missing.join(', ')}. Điền vào .env.production.local (hoặc .env.local) rồi chạy lại.`);
    process.exit(1);
  }
  const results = await checkRls({ supabaseUrl, anonKey, tables: TABLE_NAMES });
  for (const r of results) console.log(`${r.ok ? 'ok   ' : 'TRƯỢT'} ${r.table} - ${r.detail}`);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`${failed.length}/${results.length} bảng trượt: ${failed.map((r) => r.table).join(', ')}`);
    process.exit(1);
  }
  console.log(`Đạt: ${results.length}/${results.length} bảng.`);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/verify-rls.ts')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

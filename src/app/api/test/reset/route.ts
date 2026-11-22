import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { TABLE_NAMES } from '@/db/schema';
import { getConfig } from '@/server/config';

// E2E only: 404 unless E2E=1. Not wrapped in withOwner (Playwright's request context sends no Origin).
export async function POST(req: Request) {
  if (!getConfig().e2e) return new Response(null, { status: 404 });

  // `seed` is accepted and ignored until Phase 1 wires it.
  await req.json().catch(() => ({}));

  const db = await getDb();
  const list = TABLE_NAMES.map((t) => `"${t}"`).join(', ');
  await db.execute(sql.raw(`TRUNCATE ${list} RESTART IDENTITY CASCADE`));
  return new Response(null, { status: 204 });
}

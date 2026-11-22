import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { TABLE_NAMES } from '@/db/schema';
import { getConfig } from '@/server/config';
import { importSeed } from '@/server/seed/import-seed';
import { SEED_ITEMS, SEED_TERM_GOAL } from '@/server/seed/seed-data';
import { markOnboarded } from '@/server/services/settings';

// E2E only: 404 unless E2E=1. Not wrapped in withOwner (Playwright's request context sends no Origin).
// Body: { seed?: boolean; onboarded?: boolean }. Default onboarded=true; seed=true implies onboarded.
export async function POST(req: Request) {
  if (!getConfig().e2e) return new Response(null, { status: 404 });

  const raw: unknown = await req.json().catch(() => ({}));
  const body = (raw && typeof raw === 'object' ? raw : {}) as { seed?: unknown; onboarded?: unknown };
  const seed = body.seed === true;
  const onboarded = body.onboarded !== false;

  const db = await getDb();
  const list = TABLE_NAMES.map((t) => `"${t}"`).join(', ');
  await db.execute(sql.raw(`TRUNCATE ${list} RESTART IDENTITY CASCADE`));
  if (seed) {
    await importSeed(db, {
      items: SEED_ITEMS.map((s) => ({ key: s.key, name: s.name })),
      termGoal: SEED_TERM_GOAL,
      now: new Date(),
    });
  } else if (onboarded) {
    await markOnboarded(db, new Date());
  }
  return new Response(null, { status: 204 });
}

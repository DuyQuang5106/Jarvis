import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { conversations, messages, settings, TABLE_NAMES } from '@/db/schema';
import { getConfig } from '@/server/config';
import { importSeed } from '@/server/seed/import-seed';
import { SEED_ITEMS, SEED_TERM_GOAL } from '@/server/seed/seed-data';
import { getSettings, markOnboarded } from '@/server/services/settings';

// E2E only: 404 unless E2E=1. Not wrapped in withOwner (Playwright's request context sends no Origin).
// Body: { seed?: boolean; onboarded?: boolean; checkins?: boolean; activity?: { text: string; at: string }[] }.
// Default onboarded=true; seed=true implies onboarded. Check-ins are off unless `checkins: true`, so the card
// stays out of every other test. `activity` saves user messages at the given instants (check-in tests).
export async function POST(req: Request) {
  if (!getConfig().e2e) return new Response(null, { status: 404 });

  const raw: unknown = await req.json().catch(() => ({}));
  const body = (raw && typeof raw === 'object' ? raw : {}) as { seed?: unknown; onboarded?: unknown; checkins?: unknown; activity?: unknown };
  const seed = body.seed === true;
  const onboarded = body.onboarded !== false;
  const activity = (Array.isArray(body.activity) ? body.activity : []) as { text?: unknown; at?: unknown }[];

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
  await getSettings(db);
  await db.update(settings).set({ preferencesJson: { checkinsEnabled: body.checkins === true } });
  if (activity.length > 0) {
    const [c] = await db.insert(conversations).values({ title: 'E2E activity' }).returning();
    await db.insert(messages).values(
      activity.map((a) => ({ conversationId: c.id, role: 'user' as const, content: String(a.text), createdAt: new Date(String(a.at)) })),
    );
  }
  return new Response(null, { status: 204 });
}

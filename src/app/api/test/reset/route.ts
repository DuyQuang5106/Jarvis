import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { eq } from 'drizzle-orm';
import { areas, conversations, messages, settings, TABLE_NAMES } from '@/db/schema';
import { documentService } from '@/server/services/documents';
import { assessmentService, taskService, topicService } from '@/server/services/entities';
import type { TopicStatus } from '@/db/enums';
import { APP_TZ, todayIn } from '@/lib/dates';
import { getConfig } from '@/server/config';
import { importSeed } from '@/server/seed/import-seed';
import { SEED_ITEMS, SEED_TERM_GOAL } from '@/server/seed/seed-data';
import { getSettings, markOnboarded } from '@/server/services/settings';

// E2E only: 404 unless E2E=1. Not wrapped in withOwner (Playwright's request context sends no Origin).
// Body: { seed?: boolean; onboarded?: boolean; checkins?: boolean; weeklyReview?: boolean;
//   activity?: { text: string; at: string }[]; documents?: { area: string; title: string; body: string }[];
//   records?: { area; topics?: { title; status }[]; tasks?: { title; dueInDays?; progressDone?; progressTotal? }[];
//     assessments?: { title; dueInDays }[] }[] }. Records go through the services, so they are logged like real edits.
// Default onboarded=true; seed=true implies onboarded. Check-ins and the weekly review card are off unless
// `checkins: true` / `weeklyReview: true`, so the cards stay out of every other test. `activity` saves user
// messages at the given instants; `documents` adds Markdown documents to seeded areas (by name).
export async function POST(req: Request) {
  if (!getConfig().e2e) return new Response(null, { status: 404 });

  const raw: unknown = await req.json().catch(() => ({}));
  const body = (raw && typeof raw === 'object' ? raw : {}) as {
    seed?: unknown; onboarded?: unknown; checkins?: unknown; weeklyReview?: unknown; activity?: unknown; documents?: unknown; records?: unknown;
    conversations?: unknown;
  };
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
  await db.update(settings).set({ preferencesJson: { checkinsEnabled: body.checkins === true, weeklyReviewsEnabled: body.weeklyReview === true } });
  for (const d of (Array.isArray(body.documents) ? body.documents : []) as { area?: unknown; title?: unknown; body?: unknown }[]) {
    const [area] = await db.select({ id: areas.id }).from(areas).where(eq(areas.name, String(d.area)));
    if (area) await documentService.create(db, { areaId: area.id, title: String(d.title), bodyMd: String(d.body) }, { origin: 'manual' });
  }
  const day = (offset: unknown) => {
    const d = new Date(`${todayIn(APP_TZ, new Date())}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + Number(offset));
    return d.toISOString().slice(0, 10);
  };
  type Rec = {
    area?: unknown;
    topics?: { title?: unknown; status?: unknown }[];
    tasks?: { title?: unknown; dueInDays?: unknown; progressDone?: unknown; progressTotal?: unknown }[];
    assessments?: { title?: unknown; dueInDays?: unknown }[];
  };
  const manual = { origin: 'manual' as const };
  for (const r of (Array.isArray(body.records) ? body.records : []) as Rec[]) {
    const [area] = await db.select({ id: areas.id }).from(areas).where(eq(areas.name, String(r.area)));
    if (!area) continue;
    for (const t of r.topics ?? []) await topicService.create(db, { areaId: area.id, title: String(t.title), status: t.status as TopicStatus }, manual);
    for (const t of r.tasks ?? []) {
      await taskService.create(db, {
        areaId: area.id, title: String(t.title),
        ...(t.dueInDays !== undefined ? { dueDate: day(t.dueInDays) } : {}),
        ...(t.progressTotal !== undefined ? { progressTotal: Number(t.progressTotal), progressDone: Number(t.progressDone ?? 0) } : {}),
      }, manual);
    }
    for (const a of r.assessments ?? []) await assessmentService.create(db, { areaId: area.id, title: String(a.title), dueDate: day(a.dueInDays) }, manual);
  }
  // `conversations: n`: n empty chats, to fill the Recent chats list.
  const many = Math.min(Number(body.conversations) || 0, 100);
  if (many > 0) await db.insert(conversations).values(Array.from({ length: many }, (_, i) => ({ title: `Cuộc chat ${i + 1}` })));
  if (activity.length > 0) {
    const [c] = await db.insert(conversations).values({ title: 'E2E activity' }).returning();
    await db.insert(messages).values(
      activity.map((a) => ({ conversationId: c.id, role: 'user' as const, content: String(a.text), createdAt: new Date(String(a.at)) })),
    );
  }
  return new Response(null, { status: 204 });
}

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db/client';
import { areas, checkins } from '@/db/schema';
import type { CheckinStatus } from '@/db/enums';
import type { CheckinLine } from '@/lib/checkin-message';
import { APP_TZ, formatDateTimeVi, todayIn } from '@/lib/dates';
import {
  checkinLabel,
  endedSlots,
  readCheckinPrefs,
  slotId,
  slotRange,
  slotsPhrase,
  SLOT_KEYS,
  type CheckinPrefs,
  type DaySlot,
} from '@/lib/day-slots';
import { clip } from '../ai/clip';
import { firstJsonObject } from '../ai/json-reply';
import { CHECKIN_LIMITS, buildCheckinSystemPrompt } from '../ai/prompt';
import { collect, type AiProvider } from '../ai/provider';
import { getDailyBrief } from '../brief/daily-brief';
import { AiCapExceededError, ValidationError } from '../errors';
import { countAiRequest } from '../services/ai-usage';
import { getSettings } from '../services/settings';
import { ACTIVITY_LIMIT, slotActivity, type ActivityItem } from './activity';

export type CheckinSummary = { summary: string; items: CheckinLine[] };

/** The card to show: every slot that ended in the last 24 hours and was not handled yet, merged. */
export type PendingCheckin = {
  /** The latest day the card covers (YYYY-MM-DD). */
  day: string;
  slots: DaySlot[];
  /** `Sáng nay`, `Tối qua và sáng nay`. */
  label: string;
  /** For chat messages: `sáng 26/11`, `tối 25/11 và sáng 26/11`. */
  phrase: string;
  hasActivity: boolean;
  /** Present once generated (only when there is activity). */
  summary?: CheckinSummary;
  /** Up to three task titles from that day's orientation brief, for the question card. */
  suggestions: string[];
};

export type CheckinConfig = CheckinPrefs & { tz: string };

/** `cap` = daily AI cap reached, `provider` = the AI call failed, `invalid` = the reply was not a usable summary. */
export type CheckinFailure = 'cap' | 'provider' | 'invalid';
export type CheckinResult = { ok: true; checkin: PendingCheckin | null; generated: boolean } | { ok: false; reason: CheckinFailure };

export type CheckinDeps = {
  db: Db;
  provider: AiProvider;
  dailyCap: number;
  now: Date;
  cfg: CheckinConfig;
  signal?: AbortSignal;
};

export const CHECKIN_MAX_OUTPUT_TOKENS = 600;

/** The owner's check-in preferences, in the app's time zone. */
export async function loadCheckinConfig(db: DbOrTx): Promise<CheckinConfig> {
  return { ...readCheckinPrefs((await getSettings(db)).preferencesJson), tz: APP_TZ };
}

/** Stored summary: the parsed content plus the slots it was generated for. */
type StoredSummary = CheckinSummary & { covers: string[] };

const text = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/\s+/g, ' ').trim())
    .refine((s) => s.length > 0)
    .transform((s) => clip(s, max));

const summarySchema = z.object({
  summary: text(CHECKIN_LIMITS.summary),
  items: z.preprocess(
    (v) => (Array.isArray(v) ? v.slice(0, CHECKIN_LIMITS.items) : v),
    z
      .array(
        z.object({
          area: z
            .string()
            .nullish()
            .transform((s) => clip((s ?? '').replace(/\s+/g, ' ').trim(), CHECKIN_LIMITS.area)),
          text: text(CHECKIN_LIMITS.text),
        }),
      )
      .min(1),
  ),
});

/**
 * Lenient parse of the model's reply: null when it is not a usable summary. An `area` that is not one of
 * `areaNames` is dropped (left empty) rather than shown as if it were a real area.
 */
export function parseCheckinSummary(raw: string, areaNames: string[]): CheckinSummary | null {
  const json = firstJsonObject(raw);
  if (json === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  const parsed = summarySchema.safeParse(value);
  if (!parsed.success) return null;
  const known = new Set(areaNames);
  return {
    summary: parsed.data.summary,
    items: parsed.data.items.map((i) => ({ area: known.has(i.area) ? i.area : '', text: i.text })),
  };
}

function readStored(raw: unknown): StoredSummary | null {
  const s = raw as Partial<StoredSummary> | null;
  if (!s || typeof s.summary !== 'string' || !Array.isArray(s.items) || !Array.isArray(s.covers)) return null;
  return { summary: s.summary, items: s.items, covers: s.covers };
}

/** The activity of every slot, merged (latest {@link ACTIVITY_LIMIT}, oldest first). */
async function activityOf(db: DbOrTx, slots: DaySlot[], cfg: CheckinConfig): Promise<ActivityItem[]> {
  const perSlot = await Promise.all(
    slots.map((s) => {
      const r = slotRange(s.day, s.slot, cfg.tz, cfg.daySlots);
      return slotActivity(db, r.start, r.end);
    }),
  );
  return perSlot
    .flatMap((a) => a.items)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(-ACTIVITY_LIMIT);
}

type Pending = { checkin: PendingCheckin; activity: ActivityItem[] };

async function findPending(db: DbOrTx, now: Date, cfg: CheckinConfig): Promise<Pending | null> {
  if (!cfg.checkinsEnabled) return null;
  // Check-ins start on the day they were first used: before any row exists only today's slots count, so
  // the first card after install is not "Trưa, chiều và tối qua và sáng nay". The earliest row keeps that
  // floor afterwards (yesterday's slots of the first day are never asked about later).
  const [{ first }] = await db.select({ first: sql<Date | string | null>`min(${checkins.createdAt})` }).from(checkins);
  const firstAt = first ? new Date(first) : now;
  const firstDay = todayIn(cfg.tz, firstAt < now ? firstAt : now);
  const ended = endedSlots(now, cfg.tz, cfg.daySlots).filter((s) => s.day >= firstDay);
  if (ended.length === 0) return null;
  const days = [...new Set(ended.map((s) => s.day))];
  const rows = await db.select().from(checkins).where(inArray(checkins.day, days));
  const byId = new Map(rows.map((r) => [`${r.day}:${r.slot}`, r]));
  const slots = ended.filter((s) => {
    const row = byId.get(slotId(s));
    return !row || row.status === 'pending';
  });
  if (slots.length === 0) return null;

  const covers = slots.map(slotId);
  const day = slots.at(-1)!.day;
  const [activity, ...briefs] = await Promise.all([
    activityOf(db, slots, cfg),
    ...[...new Set(slots.map((s) => s.day))].reverse().map((d) => getDailyBrief(db, d)),
  ]);
  const brief = briefs.find((b) => b !== null);
  // Reused only when it was generated for exactly these slots (a slot that ended since needs a new one).
  const stored = covers
    .map((id) => readStored(byId.get(id)?.summary))
    .find((s) => s !== null && s.covers.length === covers.length && s.covers.every((c, i) => c === covers[i]));
  const hasActivity = activity.length > 0;
  return {
    activity,
    checkin: {
      day,
      slots,
      label: checkinLabel(slots, todayIn(cfg.tz, now)),
      phrase: slotsPhrase(slots),
      hasActivity,
      ...(hasActivity && stored ? { summary: { summary: stored.summary, items: stored.items } } : {}),
      suggestions: (brief?.content.tasks ?? []).slice(0, 3).map((t) => t.title),
    },
  };
}

/** The pending check-in without generating anything (no AI call), or null when there is none. */
export async function getPendingCheckin(db: DbOrTx, now: Date, cfg: CheckinConfig): Promise<PendingCheckin | null> {
  return (await findPending(db, now, cfg))?.checkin ?? null;
}

const KIND_LABEL: Record<ActivityItem['kind'], string> = {
  message: 'tin nhắn',
  log: 'thay đổi',
  document: 'tài liệu',
  proposal: 'duyệt đề xuất',
};

/** The `<activity>` block: one line per item. */
export function activityBlock(items: ActivityItem[], tz: string): string {
  const lines = items.map((i) => [formatDateTimeVi(i.at, tz), KIND_LABEL[i.kind], i.area ?? '', i.text].filter(Boolean).join(' · '));
  return `<activity>\n${lines.join('\n')}\n</activity>`;
}

/** Generations running in this server process, per database and set of slots: a concurrent caller joins. */
const inFlight = new WeakMap<Db, Map<string, Promise<CheckinResult>>>();

/**
 * The pending check-in, with its summary generated when the slots had activity and none is stored yet:
 * one AI request (no tools, only the activity and area names), counted against the daily cap. Slots
 * without activity never call the AI. The summary is stored on each slot's row as `pending`.
 */
export async function getOrCreateCheckin(deps: CheckinDeps): Promise<CheckinResult> {
  const found = await findPending(deps.db, deps.now, deps.cfg);
  if (!found) return { ok: true, checkin: null, generated: false };
  if (!found.checkin.hasActivity || found.checkin.summary) return { ok: true, checkin: found.checkin, generated: false };

  const key = found.checkin.slots.map(slotId).join(',');
  let running = inFlight.get(deps.db);
  if (!running) inFlight.set(deps.db, (running = new Map()));
  const current = running.get(key);
  if (current) return current;
  const map = running;
  const started = generate(deps, found).finally(() => map.delete(key));
  map.set(key, started);
  return started;
}

async function generate(deps: CheckinDeps, found: Pending): Promise<CheckinResult> {
  const { db, cfg } = deps;
  const { checkin } = found;
  try {
    await countAiRequest(db, todayIn(cfg.tz, deps.now), deps.dailyCap);
  } catch (e) {
    if (e instanceof AiCapExceededError) return { ok: false, reason: 'cap' };
    throw e;
  }

  const areaNames = (
    await db
      .select({ name: areas.name })
      .from(areas)
      .where(and(eq(areas.aiExcluded, false), isNull(areas.archivedAt)))
      .orderBy(areas.name)
  ).map((a) => a.name);

  let reply: string;
  try {
    const events = deps.provider.stream({
      messages: [
        { role: 'system', content: buildCheckinSystemPrompt({ areaNames }) },
        { role: 'user', content: `Buổi ${checkin.phrase}:\n${activityBlock(found.activity, cfg.tz)}` },
      ],
      maxOutputTokens: CHECKIN_MAX_OUTPUT_TOKENS,
      signal: deps.signal,
    });
    reply = (await collect(events)).text;
  } catch (e) {
    const x = e as { name?: string; status?: number };
    console.error('checkin summary failed', { name: x?.name, status: x?.status });
    return { ok: false, reason: 'provider' };
  }

  const summary = parseCheckinSummary(reply, areaNames);
  if (!summary) {
    // Sizes only: never what the model wrote.
    console.warn('checkin summary invalid', { replyChars: reply.length });
    return { ok: false, reason: 'invalid' };
  }
  const stored: StoredSummary = { ...summary, covers: checkin.slots.map(slotId) };
  await db
    .insert(checkins)
    .values(checkin.slots.map((s) => ({ day: s.day, slot: s.slot, status: 'pending' as const, summary: stored, createdAt: deps.now })))
    .onConflictDoUpdate({
      target: [checkins.day, checkins.slot],
      set: { summary: stored },
      // A slot handled meanwhile keeps its final status.
      setWhere: sql`${checkins.status} = 'pending'`,
    });
  return { ok: true, checkin: { ...checkin, summary }, generated: true };
}

export const CHECKIN_ACTIONS = { record: 'recorded', answer: 'answered', skip: 'skipped' } as const satisfies Record<string, CheckinStatus>;
export type CheckinAction = keyof typeof CHECKIN_ACTIONS;

/**
 * Marks the card's slots as handled. Only slots that have ended within the window can be marked; marking
 * one again keeps its first final status (a second tab's `Bỏ qua` does not undo `Ghi lại`).
 */
export async function resolveCheckin(
  db: DbOrTx,
  now: Date,
  cfg: CheckinConfig,
  action: CheckinAction,
  slots: DaySlot[],
): Promise<void> {
  const ended = new Set(endedSlots(now, cfg.tz, cfg.daySlots).map(slotId));
  const unique = [...new Map(slots.map((s) => [slotId(s), s])).values()];
  if (unique.length === 0 || unique.some((s) => !SLOT_KEYS.includes(s.slot) || !ended.has(slotId(s)))) {
    throw new ValidationError('Buổi này không còn chờ check-in.');
  }
  await db
    .insert(checkins)
    .values(unique.map((s) => ({ day: s.day, slot: s.slot, status: CHECKIN_ACTIONS[action], createdAt: now })))
    .onConflictDoUpdate({
      target: [checkins.day, checkins.slot],
      set: { status: CHECKIN_ACTIONS[action] },
      setWhere: sql`${checkins.status} = 'pending'`,
    });
}

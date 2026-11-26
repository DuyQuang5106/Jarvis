import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/db/client';
import { dailyBriefs } from '@/db/schema';
import { APP_TZ, todayIn } from '@/lib/dates';
import { clip } from '../ai/clip';
import { firstJsonObject } from '../ai/json-reply';
import { buildContext } from '../ai/context-builder';
import { aliasWorkspaceState } from '../ai/id-aliases';
import { BRIEF_LIMITS, buildBriefSystemPrompt } from '../ai/prompt';
import { collect, type AiProvider } from '../ai/provider';
import { AiCapExceededError } from '../errors';
import { countAiRequest } from '../services/ai-usage';

export type DailyBriefTask = { title: string; area: string; why: string };
export type DailyBriefContent = { focus: string; tasks: DailyBriefTask[]; upcoming?: string; stale?: string };
export type DailyBrief = { day: string; content: DailyBriefContent; createdAt: string };

/**
 * Why no brief came back: `empty` = nothing in the workspace the AI may read (no AI call is made),
 * `cap` = daily AI cap reached, `provider` = the AI call failed, `invalid` = the reply was not a usable brief.
 */
export type BriefFailure = 'empty' | 'cap' | 'provider' | 'invalid';
export type BriefResult = { ok: true; brief: DailyBrief; generated: boolean } | { ok: false; reason: BriefFailure };

export type BriefDeps = {
  db: Db;
  provider: AiProvider;
  dailyCap: number;
  now: Date;
  signal?: AbortSignal;
  /** `maxOutputTokens` for the provider (default 800). */
  maxOutputTokens?: number;
};

/** The portfolio question the context is built for: scope `all` then loads every area's state document. */
export const BRIEF_QUESTION = 'Hôm nay nên làm gì?';
const DEFAULT_MAX_OUTPUT_TOKENS = 800;

/** Required text: trimmed, single-spaced, non-empty, cut to `max` (a slightly long string is not worth losing the brief). */
const text = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/\s+/g, ' ').trim())
    .refine((s) => s.length > 0)
    .transform((s) => clip(s, max));
/** Optional one-liner: null, missing and blank all mean "nothing to say". */
const line = (max: number) =>
  z
    .string()
    .nullish()
    .transform((s) => {
      const t = (s ?? '').replace(/\s+/g, ' ').trim();
      return t ? clip(t, max) : undefined;
    });

const contentSchema = z.object({
  focus: text(BRIEF_LIMITS.focus),
  // Extra tasks are dropped before validation: only the ones shown have to be well-formed.
  tasks: z.preprocess(
    (v) => (Array.isArray(v) ? v.slice(0, BRIEF_LIMITS.tasks) : v),
    z
      .array(z.object({ title: text(BRIEF_LIMITS.title), area: text(BRIEF_LIMITS.area), why: text(BRIEF_LIMITS.why) }))
      .min(1),
  ),
  upcoming: line(BRIEF_LIMITS.line),
  stale: line(BRIEF_LIMITS.line),
});

/** Lenient parse of the model's reply (or of a stored row): null when it is not a usable brief. */
export function parseBriefContent(raw: unknown): DailyBriefContent | null {
  let value = raw;
  if (typeof raw === 'string') {
    const json = firstJsonObject(raw);
    if (json === null) return null;
    try {
      value = JSON.parse(json);
    } catch {
      return null;
    }
  }
  const parsed = contentSchema.safeParse(value);
  if (!parsed.success) return null;
  const { focus, tasks, upcoming, stale } = parsed.data;
  return { focus, tasks, ...(upcoming ? { upcoming } : {}), ...(stale ? { stale } : {}) };
}

/** The stored brief of `day` (YYYY-MM-DD), or null (none, or a row this version cannot read). */
export async function getDailyBrief(db: Db, day: string): Promise<DailyBrief | null> {
  const [row] = await db.select().from(dailyBriefs).where(eq(dailyBriefs.day, day));
  if (!row) return null;
  const content = parseBriefContent(row.content);
  return content ? { day: row.day, content, createdAt: row.createdAt.toISOString() } : null;
}

/** Generations running in this server process, per database and day: a concurrent caller joins instead of calling the AI again. */
const inFlight = new WeakMap<Db, Map<string, Promise<BriefResult>>>();

/**
 * Today's brief. Without `force` a stored brief is returned as is (no AI call). Otherwise one AI request is
 * counted against the daily cap, and the reply is stored only when it is a valid brief.
 */
export function generateDailyBrief(deps: BriefDeps, opts: { force?: boolean } = {}): Promise<BriefResult> {
  const day = todayIn(APP_TZ, deps.now);
  let running = inFlight.get(deps.db);
  if (!running) inFlight.set(deps.db, (running = new Map()));
  const current = running.get(day);
  if (current) return current;
  const map = running;
  const started = generate(deps, day, opts.force === true).finally(() => map.delete(day));
  map.set(day, started);
  return started;
}

async function generate(deps: BriefDeps, day: string, force: boolean): Promise<BriefResult> {
  const { db } = deps;
  if (!force) {
    const stored = await getDailyBrief(db, day);
    if (stored) return { ok: true, brief: stored, generated: false };
  }

  const ctx = await buildContext(db, { message: BRIEF_QUESTION, recentUserMessages: [], scope: { mode: 'all' }, now: deps.now });
  if (ctx.state.areas.length === 0) return { ok: false, reason: 'empty' };

  try {
    await countAiRequest(db, day, deps.dailyCap);
  } catch (e) {
    if (e instanceof AiCapExceededError) return { ok: false, reason: 'cap' };
    throw e;
  }

  let reply: string;
  try {
    // Aliased ids, as in a chat turn: AI proxies that scrub UUIDs must not garble the state.
    const stateJson = aliasWorkspaceState(ctx.state).json;
    const events = deps.provider.stream({
      messages: [
        { role: 'system', content: buildBriefSystemPrompt({ stateJson }) },
        { role: 'user', content: BRIEF_QUESTION },
      ],
      maxOutputTokens: deps.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      signal: deps.signal,
    });
    reply = (await collect(events)).text;
  } catch (e) {
    const x = e as { name?: string; status?: number };
    console.error('daily brief failed', { name: x?.name, status: x?.status });
    return { ok: false, reason: 'provider' };
  }

  const content = parseBriefContent(reply);
  if (!content) {
    // Sizes only: never what the model wrote.
    console.warn('daily brief invalid', { replyChars: reply.length });
    return { ok: false, reason: 'invalid' };
  }
  const [row] = await db
    .insert(dailyBriefs)
    .values({ day, content, createdAt: deps.now })
    .onConflictDoUpdate({ target: dailyBriefs.day, set: { content, createdAt: deps.now } })
    .returning();
  return { ok: true, brief: { day: row.day, content, createdAt: row.createdAt.toISOString() }, generated: true };
}

import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import type { Db, DbOrTx } from '@/db/client';
import { checkins, messages, pendingActions, weeklyReviews } from '@/db/schema';
import { weeklyReviewMessage, weeklyReviewTitle } from '@/lib/weekly-review-message';
import { addDays } from '@/lib/day-slots';
import { dueReviewWeek, readWeeklyReviewsEnabled, weekInstants, weekLabel } from '@/lib/weeks';
import type { AiProvider } from '../ai/provider';
import { runChatTurn, type TurnDeps, type TurnTimingReport } from '../chat/run-turn';
import { slotActivity } from '../checkin/activity';
import { getSettings } from '../services/settings';
import { collectWeekActivity, weekActivityBlock } from './week-activity';

/** A generated review: where it lives and what the card shows. */
export type ReadyReview = {
  weekStart: string;
  label: string;
  conversationId: string;
  /** 2–3 key points (the review's `Ý chính`). */
  highlights: string[];
  pendingActionId: string | null;
};

/** The card on a new conversation: a week to review (generated when the card opens), or one awaiting approval. */
export type WeeklyReviewCard = { state: 'pending'; weekStart: string; label: string } | ({ state: 'ready' } & ReadyReview);

export type WeeklyReviewDeps = {
  db: Db;
  provider: AiProvider;
  actionMode: TurnDeps['actionMode'];
  dailyCap: number;
  now: Date;
  tz: string;
  model?: string;
  onTiming?: (t: TurnTimingReport) => void;
};

export type WeeklyReviewResult =
  | { ok: true; review: ReadyReview; generated: boolean }
  | { ok: false; error: string; reason: 'cap' | 'provider' };

const HIGHLIGHTS = 3;

const plainLine = (s: string) =>
  s
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** The bullets under `## Ý chính` (at most 3), else the first bullets of the review. */
export function reviewHighlights(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/);
  const at = lines.findIndex((l) => /^#{1,6}\s+Ý chính\b/i.test(l.trim()));
  const bullet = (l: string) => /^\s*(?:[-*+]|\d+[.)])\s+\S/.test(l);
  let picked: string[] = [];
  if (at >= 0) {
    const rest = lines.slice(at + 1);
    const end = rest.findIndex((l) => /^#{1,6}\s/.test(l.trim()));
    picked = (end < 0 ? rest : rest.slice(0, end)).filter(bullet);
  }
  if (picked.length === 0) picked = lines.filter(bullet);
  return picked.map(plainLine).filter(Boolean).slice(0, HIGHLIGHTS);
}

async function toReady(db: DbOrTx, row: typeof weeklyReviews.$inferSelect): Promise<ReadyReview | null> {
  if (!row.conversationId) return null;
  const [reply] = await db
    .select({ content: messages.content })
    .from(messages)
    .where(and(eq(messages.conversationId, row.conversationId), eq(messages.role, 'assistant')))
    .orderBy(asc(messages.createdAt))
    .limit(1);
  return {
    weekStart: row.weekStart,
    label: weekLabel(row.weekStart),
    conversationId: row.conversationId,
    highlights: reviewHighlights(reply?.content ?? ''),
    pendingActionId: row.pendingActionId,
  };
}

/** The stored review of `weekStart`, or null. */
export async function getWeeklyReview(db: DbOrTx, weekStart: string): Promise<ReadyReview | null> {
  const [row] = await db.select().from(weeklyReviews).where(eq(weeklyReviews.weekStart, weekStart));
  return row ? toReady(db, row) : null;
}

/** Anything done in the week: a message, a record change, a document edit, an approval, a check-in handled. */
async function weekHasActivity(db: DbOrTx, weekStart: string, tz: string): Promise<boolean> {
  const { start, end } = weekInstants(weekStart, tz);
  const one = { message: 1, log: 1, document: 1, proposal: 1 };
  const [activity, [answered]] = await Promise.all([
    slotActivity(db, start, end, { limits: one, total: 1, keepCheckinMessages: true }),
    db
      .select({ day: checkins.day })
      .from(checkins)
      .where(and(inArray(checkins.status, ['answered', 'recorded']), gte(checkins.day, weekStart), lt(checkins.day, addDays(weekStart, 7))))
      .limit(1),
  ]);
  return activity.hasActivity || !!answered;
}

/**
 * The weekly review card at `now`: the due week ({@link dueReviewWeek}) while it is not reviewed and had any
 * activity (an empty week is not worth an AI call on its own; `Tổng kết tuần này` still reviews any week),
 * or its review while the proposal it made still waits for approval. Null otherwise, or when turned off.
 */
export async function getWeeklyReviewCard(db: DbOrTx, now: Date, tz: string): Promise<WeeklyReviewCard | null> {
  if (!readWeeklyReviewsEnabled((await getSettings(db)).preferencesJson)) return null;
  const weekStart = dueReviewWeek(now, tz);
  const [row] = await db
    .select({ review: weeklyReviews, status: pendingActions.status })
    .from(weeklyReviews)
    .leftJoin(pendingActions, eq(pendingActions.id, weeklyReviews.pendingActionId))
    .where(eq(weeklyReviews.weekStart, weekStart));
  if (row) {
    if (row.status !== 'pending') return null;
    const ready = await toReady(db, row.review);
    return ready ? { state: 'ready', ...ready } : null;
  }
  if (!(await weekHasActivity(db, weekStart, tz))) return null;
  return { state: 'pending', weekStart, label: weekLabel(weekStart) };
}

/** Generations running in this server process, per database and week: a concurrent caller joins. */
const inFlight = new WeakMap<Db, Map<string, Promise<WeeklyReviewResult>>>();

/**
 * Reviews the week of `weekStart` (at most one review per week): returns the stored one unless `regenerate`.
 * The review is a normal chat turn in a new conversation `Tổng kết tuần 23/11–29/11` (runChatTurn in its
 * `weeklyReview` mode): the user message is the review command, the reply is the review, and its
 * `replace_section` proposal waits for approval like any other. Nothing is written to the workspace here.
 */
export async function generateWeeklyReview(
  deps: WeeklyReviewDeps,
  opts: { weekStart: string; regenerate?: boolean },
): Promise<WeeklyReviewResult> {
  let running = inFlight.get(deps.db);
  if (!running) inFlight.set(deps.db, (running = new Map()));
  const current = running.get(opts.weekStart);
  if (current) return current;
  const map = running;
  const started = generate(deps, opts).finally(() => map.delete(opts.weekStart));
  map.set(opts.weekStart, started);
  return started;
}

async function generate(deps: WeeklyReviewDeps, opts: { weekStart: string; regenerate?: boolean }): Promise<WeeklyReviewResult> {
  const { db } = deps;
  const { weekStart } = opts;
  const [existing] = await db.select().from(weeklyReviews).where(eq(weeklyReviews.weekStart, weekStart));
  if (existing && !opts.regenerate) {
    const ready = await toReady(db, existing);
    if (ready) return { ok: true, review: ready, generated: false };
  }

  const label = weekLabel(weekStart);
  const activity = await collectWeekActivity(db, weekStart, deps.tz);
  let conversationId: string | null = null;
  let pendingActionId: string | null = null;
  let error: string | null = null;
  let done = false;
  const turn = runChatTurn(
    {
      db,
      provider: deps.provider,
      actionMode: deps.actionMode,
      dailyCap: deps.dailyCap,
      now: deps.now,
      model: deps.model,
      onTiming: deps.onTiming,
      // No signal: the review finishes and is stored even when the page that asked for it is closed.
    },
    {
      message: weeklyReviewMessage(label),
      scope: { mode: 'all' },
      weeklyReview: { title: weeklyReviewTitle(label), weekActivity: weekActivityBlock(activity, deps.tz) },
    },
  );
  for await (const e of turn) {
    if (e.type === 'meta') conversationId = e.conversationId;
    else if (e.type === 'proposal') pendingActionId = e.pendingActionId;
    else if (e.type === 'error') error = e.message;
    else if (e.type === 'done') done = true;
  }
  if (!done || !conversationId) {
    const message = error ?? 'Chưa tổng kết được tuần này.';
    return { ok: false, error: message, reason: message.startsWith('Đã chạm trần') ? 'cap' : 'provider' };
  }

  if (existing?.pendingActionId) {
    // Reviewed again on purpose: the earlier compression would rewrite the same sections.
    await db
      .update(pendingActions)
      .set({ status: 'superseded', resolvedAt: new Date() })
      .where(and(eq(pendingActions.id, existing.pendingActionId), eq(pendingActions.status, 'pending')));
  }
  const values = { weekStart, conversationId, pendingActionId, createdAt: deps.now };
  const [row] = await db
    .insert(weeklyReviews)
    .values(values)
    .onConflictDoUpdate({ target: weeklyReviews.weekStart, set: { conversationId, pendingActionId, createdAt: deps.now } })
    .returning();
  return { ok: true, review: (await toReady(db, row))!, generated: true };
}

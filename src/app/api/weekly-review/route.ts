import { connection } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { APP_TZ } from '@/lib/dates';
import { currentWeekStart, dueReviewWeek } from '@/lib/weeks';
import { getProvider } from '@/server/ai/provider';
import { withOwner } from '@/server/auth';
import { getConfig } from '@/server/config';
import { requestNow } from '@/server/request-now';
import { generateWeeklyReview, getWeeklyReviewCard } from '@/server/review/weekly-review';

// The review reads the whole workspace and writes up to 6,000 tokens: longer than a chat turn.
export const maxDuration = 300;

const FAILED = 'Chưa tổng kết được tuần này. Dữ liệu của bạn không bị ảnh hưởng.';
const noStore = { 'Cache-Control': 'no-store' };

/** The weekly review card to show (`card: null` when there is none). Never generates anything. */
const get = withOwner(async (req) => {
  try {
    const card = await getWeeklyReviewCard(await getDb(), requestNow(req.headers), APP_TZ);
    return Response.json({ card }, { headers: noStore });
  } catch (err) {
    console.error('Weekly review GET failed:', err instanceof Error ? err.name : 'UnknownError');
    return Response.json({ error: FAILED }, { status: 500, headers: noStore });
  }
});

const bodySchema = z.object({
  /** `due`: the week the card offers; `current`: this week (`Tổng kết tuần này`, any day). */
  week: z.enum(['due', 'current']),
  /** Review the week again on purpose (a new conversation; the earlier one stays). */
  regenerate: z.boolean().optional(),
});

/** Generates the review of the week (or returns the stored one). */
const post = withOwner(async (req) => {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'bad_request' }, { status: 400 });
  try {
    const cfg = getConfig();
    const now = requestNow(req.headers);
    const result = await generateWeeklyReview(
      {
        db: await getDb(),
        // getProvider() throws when the AI is not configured: reported like any other failed attempt.
        provider: getProvider(),
        actionMode: cfg.aiActionMode,
        dailyCap: cfg.aiDailyRequestCap,
        now,
        tz: APP_TZ,
        model: cfg.aiProvider === 'mock' ? 'mock' : cfg.aiModel,
      },
      { weekStart: parsed.data.week === 'current' ? currentWeekStart(now, APP_TZ) : dueReviewWeek(now, APP_TZ), regenerate: parsed.data.regenerate },
    );
    if (result.ok) return Response.json({ review: result.review }, { headers: noStore });
    return Response.json({ error: result.error }, { status: result.reason === 'cap' ? 429 : 502, headers: noStore });
  } catch (err) {
    console.error('Weekly review POST failed:', err instanceof Error ? err.name : 'UnknownError');
    return Response.json({ error: FAILED }, { status: 500, headers: noStore });
  }
});

export async function GET(req: Request) {
  await connection(); // request-time only: never prerendered during `next build`
  return get(req, undefined);
}

export async function POST(req: Request) {
  await connection();
  return post(req, undefined);
}

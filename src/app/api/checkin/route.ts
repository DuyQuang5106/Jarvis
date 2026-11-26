import { connection } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { SLOT_KEYS } from '@/db/enums';
import { isValidDateStr } from '@/lib/dates';
import { getProvider } from '@/server/ai/provider';
import { withOwner } from '@/server/auth';
import { CHECKIN_ACTIONS, getOrCreateCheckin, loadCheckinConfig, resolveCheckin, type CheckinFailure } from '@/server/checkin/checkin';
import { getConfig } from '@/server/config';
import { ValidationError } from '@/server/errors';
import { requestNow } from '@/server/request-now';

// Generating a summary waits for the AI (same limit as /api/chat).
export const maxDuration = 60;

const FAILED = 'Chưa tóm tắt được buổi vừa qua. Dữ liệu của bạn không bị ảnh hưởng.';
const MESSAGES: Record<CheckinFailure, { error: string; status: number }> = {
  cap: { error: 'Đã chạm trần số lượt hỏi AI hôm nay.', status: 429 },
  provider: { error: FAILED, status: 502 },
  invalid: { error: 'AI trả về tóm tắt không đọc được.', status: 502 },
};

const noStore = { 'Cache-Control': 'no-store' };

/** The pending check-in (`checkin: null` when there is none), with its summary generated when needed. */
const get = withOwner(async (req) => {
  try {
    const db = await getDb();
    const cfg = getConfig();
    const result = await getOrCreateCheckin({
      db,
      // getProvider() throws when the AI is not configured: reported like any other failed attempt.
      provider: getProvider(),
      dailyCap: cfg.aiDailyRequestCap,
      now: requestNow(req.headers),
      cfg: await loadCheckinConfig(db),
      signal: req.signal,
    });
    if (result.ok) return Response.json({ checkin: result.checkin }, { headers: noStore });
    const { error, status } = MESSAGES[result.reason];
    return Response.json({ error }, { status, headers: noStore });
  } catch (err) {
    console.error('Checkin GET failed:', err instanceof Error ? err.name : 'UnknownError');
    return Response.json({ error: FAILED }, { status: 500, headers: noStore });
  }
});

const bodySchema = z.object({
  action: z.enum(Object.keys(CHECKIN_ACTIONS) as [keyof typeof CHECKIN_ACTIONS, ...(keyof typeof CHECKIN_ACTIONS)[]]),
  slots: z
    .array(z.object({ day: z.string().refine(isValidDateStr), slot: z.enum(SLOT_KEYS) }))
    .min(1)
    .max(SLOT_KEYS.length * 2),
});

/** Marks the card's slots: `record` (Ghi lại), `answer` (the question was answered), `skip` (Bỏ qua). */
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
    const db = await getDb();
    await resolveCheckin(db, requestNow(req.headers), await loadCheckinConfig(db), parsed.data.action, parsed.data.slots);
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof ValidationError) return Response.json({ error: err.message }, { status: 409 });
    console.error('Checkin POST failed:', err instanceof Error ? err.name : 'UnknownError');
    return Response.json({ error: 'Có lỗi xảy ra, thử lại.' }, { status: 500 });
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

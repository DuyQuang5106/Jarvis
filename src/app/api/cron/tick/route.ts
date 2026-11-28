import { timingSafeEqual } from 'node:crypto';
import { connection } from 'next/server';
import { getDb } from '@/db/client';
import { getConfig } from '@/server/config';
import { webPushSender } from '@/server/push/send';
import { runTick } from '@/server/push/tick';
import { requestNow } from '@/server/request-now';

export const maxDuration = 60;

const json = (body: unknown, status = 200) => Response.json(body, { status });

function authorized(req: Request): boolean {
  const secret = getConfig().cronSecret;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

/**
 * The scheduler's entry point (Supabase pg_cron every 5 minutes, docs/deploy.md §9). No session: it proves
 * itself with `Authorization: Bearer $CRON_SECRET`. Sends what is due (see runTick) and says what it sent.
 */
export async function POST(req: Request) {
  await connection();
  if (!authorized(req)) return json({ error: 'unauthorized' }, 401);
  const send = webPushSender();
  if (!send) return json({ sent: [], skipped: 'no-vapid-keys' });
  const report = await runTick(await getDb(), requestNow(req.headers), send);
  return json(report);
}

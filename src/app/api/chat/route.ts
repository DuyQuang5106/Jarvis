import { connection } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { getProvider } from '@/server/ai/provider';
import { withOwner } from '@/server/auth';
import { toNdjsonStream } from '@/server/chat/ndjson';
import { runChatTurn } from '@/server/chat/run-turn';
import { getConfig } from '@/server/config';

export const maxDuration = 60;

const MAX_BODY = 64 * 1024;

const bodySchema = z.object({
  conversationId: z.uuid().optional(),
  message: z.string().optional(),
  scope: z.union([
    z.object({ mode: z.enum(['auto', 'all', 'academic', 'projects']) }),
    z.object({ mode: z.literal('item'), areaId: z.uuid() }),
  ]),
  regenerate: z.boolean().optional(),
});

const badRequest = () => Response.json({ error: 'bad_request' }, { status: 400 });

const handler = withOwner(async (req) => {
  // A declared size over the limit is refused unread; the check after reading covers bodies without one.
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) return badRequest();
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY) return badRequest();
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return badRequest();
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return badRequest();

  const cfg = getConfig();
  const events = runChatTurn(
    {
      db: await getDb(),
      provider: getProvider(),
      actionMode: cfg.aiActionMode,
      dailyCap: cfg.aiDailyRequestCap,
      now: new Date(),
      signal: req.signal,
    },
    parsed.data,
  );
  return new Response(toNdjsonStream(events), {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  });
});

export async function POST(req: Request) {
  await connection(); // request-time only: never prerendered during `next build`
  return handler(req, undefined);
}

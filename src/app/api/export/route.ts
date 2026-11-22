import { connection } from 'next/server';
import { getDb } from '@/db/client';
import { APP_TZ, todayIn } from '@/lib/dates';
import { withOwner } from '@/server/auth';
import { buildExport } from '@/server/queries/export';

const handler = withOwner(async () => {
  const now = new Date();
  const data = await buildExport(await getDb(), now);
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="personal-ai-export-${todayIn(APP_TZ, now)}.json"`,
      'Cache-Control': 'no-store',
    },
  });
});

export async function GET(req: Request) {
  await connection(); // request-time only: never prerendered (or the session read) during `next build`
  return handler(req, undefined);
}

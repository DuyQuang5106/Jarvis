import { redirect } from 'next/navigation';
import { getConfig } from './config';
import { type Owner, isSameOrigin, resolveOwner } from './owner';
import { createSupabaseServerClient } from './supabase';

export async function getOwner(): Promise<Owner | null> {
  return resolveOwner(getConfig(), async () => {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.email ?? null;
  });
}

export async function requireOwner(): Promise<Owner> {
  const owner = await getOwner();
  if (!owner) redirect('/login');
  return owner;
}

const json = (body: unknown, status: number) => Response.json(body, { status });

export function withOwner<C>(
  handler: (req: Request, owner: Owner, ctx: C) => Promise<Response>,
): (req: Request, ctx: C) => Promise<Response> {
  return async (req, ctx) => {
    const owner = await getOwner();
    if (!owner) return json({ error: 'unauthorized' }, 401);
    if (req.method !== 'GET' && req.method !== 'HEAD' && !isSameOrigin(req)) {
      return json({ error: 'forbidden' }, 403);
    }
    return handler(req, owner, ctx);
  };
}

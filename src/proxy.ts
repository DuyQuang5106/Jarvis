import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/server/config';

// Refreshes the Supabase session cookie on every page request (Next 16 "proxy", formerly middleware).
// Authorization itself is enforced in requireOwner()/withOwner(), not here.
export async function proxy(request: NextRequest) {
  const cfg = getConfig();
  if (cfg.authMode !== 'supabase' || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return NextResponse.next();

  let response = NextResponse.next({ request });
  const cacheHeaders: Record<string, string> = {};
  const supabase = createServerClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        // Recreated per call, so keep every header seen so far and re-apply (later calls pass none).
        Object.assign(cacheHeaders, headers);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
        // Responses that set auth cookies must not be cached by a CDN (Cache-Control: no-store etc.).
        for (const [key, value] of Object.entries(cacheHeaders)) response.headers.set(key, value);
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};

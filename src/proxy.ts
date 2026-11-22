import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/server/config';

/** Page requests (HTML and RSC) that need a session. API routes answer 401 themselves via withOwner(). */
function isProtectedPage(pathname: string): boolean {
  if (pathname === '/api' || pathname.startsWith('/api/')) return false;
  if (pathname === '/login' || pathname.startsWith('/login/')) return false;
  if (pathname.startsWith('/_next/')) return false;
  // Static files and metadata routes: /manifest.webmanifest, /icons/*.png, /favicon.ico...
  if (/\.[a-z0-9]+$/i.test(pathname)) return false;
  return true;
}

// Refreshes the Supabase session cookie on every request (Next 16 "proxy", formerly middleware) and sends page
// requests without a user to /login. This redirect is only an optimistic first line: every page, server component
// reading private data, server action and route handler still checks the owner itself (requireOwner/withOwner).
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

  let hasUser = false;
  try {
    const { data } = await supabase.auth.getUser();
    hasUser = !!data.user;
  } catch {
    // Supabase unreachable or a malformed answer: treat as signed out.
  }
  if (hasUser || !isProtectedPage(request.nextUrl.pathname)) return response;

  const redirect = NextResponse.redirect(new URL('/login', request.url));
  // Keep whatever the session refresh decided (e.g. cleared cookies) and never let a CDN cache this redirect.
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  for (const [key, value] of Object.entries(cacheHeaders)) redirect.headers.set(key, value);
  if (!redirect.headers.has('cache-control')) redirect.headers.set('Cache-Control', 'private, no-store');
  return redirect;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};

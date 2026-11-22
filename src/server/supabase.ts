import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getConfig } from './config';
import { ConfigError } from './errors';

export async function createSupabaseServerClient() {
  const cfg = getConfig();
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    throw new ConfigError('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  const cookieStore = await cookies();
  return createServerClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      // The no-cache `headers` arg is not applied here: Server Components/Actions have no response object to set
      // it on. Responses carrying refreshed cookies are produced by the proxy, which does apply them.
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only; the proxy refreshes the session.
        }
      },
    },
  });
}

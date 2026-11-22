'use server';

import { redirect } from 'next/navigation';
import { getConfig } from '@/server/config';
import { isOwnerEmail } from '@/server/owner';
import { createSupabaseServerClient } from '@/server/supabase';

export type LoginState = { error?: string };

const BAD_CREDENTIALS = 'Email hoặc mật khẩu không đúng.';

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const cfg = getConfig();
  if (cfg.authMode === 'dev') redirect('/chat');

  const email = formData.get('email');
  const password = formData.get('password');
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return { error: BAD_CREDENTIALS };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error || !isOwnerEmail(data.user?.email, cfg.ownerEmail)) {
    // Same message either way so the form never reveals which emails exist.
    if (!error) await supabase.auth.signOut();
    return { error: BAD_CREDENTIALS };
  }
  redirect('/chat');
}

export async function signOut(): Promise<void> {
  if (getConfig().authMode === 'supabase') {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect('/login');
}

'use server';

import { redirect } from 'next/navigation';
import { getConfig } from '@/server/config';
import { isOwnerEmail } from '@/server/owner';
import { createSupabaseServerClient } from '@/server/supabase';

export type LoginState = { error?: string };

const BAD_CREDENTIALS = 'Email hoặc mật khẩu không đúng.';
const SERVICE_DOWN = 'Không kết nối được dịch vụ đăng nhập, thử lại.';

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
  if (error) {
    // Log only the error's shape: never the email, password or message (which may echo input).
    console.error('Đăng nhập Supabase lỗi', { status: error.status, code: error.code, name: error.name });
    return { error: isBadCredentials(error) ? BAD_CREDENTIALS : SERVICE_DOWN };
  }
  if (!isOwnerEmail(data.user?.email, cfg.ownerEmail)) {
    // Same message as wrong credentials so the form never reveals which emails exist.
    await supabase.auth.signOut({ scope: 'local' });
    return { error: BAD_CREDENTIALS };
  }
  redirect('/chat');
}

function isBadCredentials(error: { status?: number; code?: string }): boolean {
  return error.status === 400 || error.code === 'invalid_credentials';
}

export async function signOut(): Promise<void> {
  if (getConfig().authMode === 'supabase') {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut({ scope: 'local' });
  }
  redirect('/login');
}

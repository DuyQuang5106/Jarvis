import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getOwner } from '@/server/auth';
import { getConfig } from '@/server/config';
import { LoginForm } from './login-form';

export default function LoginPage() {
  // Reading the session needs request data, so it sits behind Suspense (cacheComponents).
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Suspense fallback={null}>
        <LoginGate />
      </Suspense>
    </main>
  );
}

async function LoginGate() {
  await connection(); // request-time only: never evaluate config/session during `next build`
  if (getConfig().authMode === 'dev') redirect('/chat');
  if (await getOwner()) redirect('/chat');
  return <LoginForm />;
}

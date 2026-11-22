export async function register() {
  // Runs once at server start (not during `next build`): refuse to boot with an unsafe production config.
  if (process.env.NEXT_RUNTIME === 'edge') return;
  const { assertSafeConfig, getConfig } = await import('./server/config');
  try {
    assertSafeConfig(getConfig());
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    // Next only logs errors thrown here and keeps serving 500s; stop the process outright.
    process.exit(1);
  }
}

export async function register() {
  // Runs once at server start (not during `next build`): refuse to boot with an unsafe production config.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertSafeConfigOrExit } = await import('./instrumentation-node');
    assertSafeConfigOrExit();
  }
}
